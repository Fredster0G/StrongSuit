import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { QRCodeSVG } from 'qrcode.react'
import {
  RadioTower, Copy, Check, ShieldCheck, ShieldAlert, Upload, Download,
  Trash2, Link2, Wifi, Cloud, Save, RefreshCw
} from 'lucide-react'
import {
  Card, SectionHeader, Button, Field, Select, Textarea, Tag, EmptyState,
  Dialog, toast, toastError, Input, Stat, SegmentedControl,
} from '@/design'
import { devicesRepo, clientsRepo, trainerRepo } from '@/db/repo'
import { fullName, daysSince } from '@/lib/core'
import { downloadText } from '@/db/backup'
import {
  encodePairingCode, decodePairingCode, safetyNumber, type PairingCode,
} from '@/lib/sync'
import { getIdentity, pairDevice, buildPacket, applyPacket } from './syncApi'
import { syncWith } from '@/lib/sync/broker'
import { PATH_LABELS } from '@/lib/sync/p2pProtocol'
import { relayTransport } from './transports/relayTransport'
import { p2pTransport, pathForDevice } from './transports/p2pTransport'
import { ConflictsCard } from './ConflictsCard'
import { cloudCapabilities } from '@/lib/cloudCapability'
import type { Device, SyncIdentity, Trainer } from '@/db/types'
import { useTranslation, type MessageKey } from '@/lib/i18n'

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const { t } = useTranslation()
  const displayLabel = label ?? t('sync.copy.label')
  return (
    <Button size="sm" variant="secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }
      catch { toastError(t('sync.copy.failed')) }
    }}>
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? t('sync.copy.copied') : displayLabel}
    </Button>
  )
}

function PairDialog({ open, onClose, myPublic }: { open: boolean; onClose: () => void; myPublic?: JsonWebKey }) {
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const [codeText, setCodeText] = useState('')
  const [parsed, setParsed] = useState<PairingCode | null>(null)
  const [sas, setSas] = useState('')
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState('')
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) { setCodeText(''); setParsed(null); setSas(''); setClientId(''); setError('') }
  }, [open])

  async function check() {
    setError('')
    try {
      const c = decodePairingCode(codeText)
      setParsed(c)
      if (myPublic) setSas(await safetyNumber(myPublic, c.pub))
    } catch (e) {
      setParsed(null)
      setError(e instanceof Error ? e.message : t('sync.pair.invalidCode'))
    }
  }

  async function confirm() {
    if (!parsed) return
    await pairDevice(parsed, { verified: true, clientId: clientId || undefined })
    toast(t('sync.toast.paired', { name: parsed.name }))
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('sync.pair.title')} width={480}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          {t('sync.pair.hint')}
        </p>
        <Field label={t('sync.pair.codeLabel')}>
          <Textarea value={codeText} onChange={e => setCodeText(e.target.value)} placeholder={t('sync.pair.codePlaceholder')} className="font-mono text-2xs" />
        </Field>
        {error && <p className="text-2xs text-signal-600">{error}</p>}
        {!parsed ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={check} disabled={!codeText.trim()}>{t('sync.pair.checkBtn')}</Button>
          </div>
        ) : (
          <>
            <div className="rounded-card border border-line bg-surface2 p-3">
              <p className="text-xs text-muted">{t('sync.pair.with')}<span className="font-medium text-ink">{parsed.name}</span> ({parsed.role})</p>
              <p className="mt-2 text-2xs font-medium uppercase tracking-wide text-faint">{t('sync.pair.safetyLabel')}</p>
              <p className="font-mono tabular-nums text-2xl font-semibold tracking-widest text-verde-600">{sas}</p>
            </div>
            {parsed.role === 'client' && (
              <Field label={t('sync.pair.clientLabel')} hint={t('sync.pair.clientHint')}>
                <Select value={clientId} onChange={e => setClientId(e.target.value)}>
                  <option value="">{t('sync.pair.clientDefault')}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                </Select>
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setParsed(null)}>{t('sync.pair.backBtn')}</Button>
              <Button variant="primary" onClick={confirm}>{t('sync.pair.confirmBtn')}</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

/** Sync-freshness dot for a device row.
 *
 * The row already carries a verified/unverified `Tag` — duplicating that as a
 * second colored dot would say nothing new. What actually has no visual
 * weight today is how STALE a device's last sync is: "Last sync March 2nd"
 * and "Last sync 4 minutes ago" read identically except for the date text.
 * Computed purely from `lastSyncAt`, which is the only signal this app has
 * for it — no invented "connected now" state, since a local-first app with no
 * persistent connection has no way to know that. */
function syncFreshness(device: Device, t: (k: MessageKey, opts?: Record<string, string>) => string): { color: string; label: string } {
  const days = daysSince(device.lastSyncAt)
  if (days == null) return { color: 'bg-faint', label: t('sync.freshness.never') }
  if (days <= 1) return { color: 'bg-verde-600', label: t('sync.freshness.recently') }
  if (days <= 14) return { color: 'bg-ember-500', label: t('sync.freshness.daysAgo', { days: String(days) }) }
  return { color: 'bg-signal-600', label: t('sync.freshness.notSynced', { days: String(days) }) }
}

// `identity` is no longer a prop: the relay transport resolves it itself via
// getIdentity(), so this row doesn't need to thread it through any more.
function DeviceRow({ device, trainer }: { device: Device; trainer: Trainer | undefined }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [syncing, setSyncing] = useState(false)
  const { t } = useTranslation()

  async function createPacket() {
    try {
      const { filename, text } = await buildPacket(device)
      downloadText(filename, text)
      toast(t('sync.toast.packetCreated', { name: device.name }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('sync.toast.packetFailed'))
    }
  }

  async function onFile(f: File) {
    try {
      const text = await f.text()
      const r = await applyPacket(device, text)
      if (r.replayed) { toast(t('sync.toast.alreadyApplied')); return }
      toast(t('sync.toast.syncedFrom', { 
        name: device.name, 
        applied: String(r.applied), 
        skipped: r.skipped ? t('sync.toast.skipped', { count: String(r.skipped) }) : '' 
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('sync.toast.applyFailed'))
    }
  }

  const cap = cloudCapabilities(trainer)

  // Routed through the sync broker (lib/sync/broker.ts) rather than fetching
  // inline: the broker owns transport choice and failure messaging, so this
  // component no longer knows a relay exists. Behaviour is unchanged today
  // (relay is the only registered transport) — but LAN and P2P will slot in
  // here with no edit to this file, which is the whole point of the seam.
  async function doCloudSync() {
    if (!cap.sync) return toastError(cap.reasonUnavailable || t('sync.toast.cloudUnavailable'))
    setSyncing(true)
    try {
      const outcome = await syncWith(
        {
          device,
          relayUrl: trainer?.syncServerUrl,
          relayApiKey: trainer?.syncServerApiKey,
        },
        // Order here doesn't matter — the broker sorts by cost. P2P is tried
        // before the store-and-forward relay when both devices are awake and
        // NAT allows it, and falls through silently when they aren't.
        [p2pTransport, relayTransport],
      )
      if (outcome.ok) {
        // When P2P carried it, say WHICH P2P — direct and TURN-relayed are
        // both end-to-end encrypted, but claiming "no server involved" while
        // a relay carries every byte would be untrue.
        const path = outcome.via === 'p2p' ? pathForDevice(device.id) : undefined
        toast(path ? `${outcome.message} (${PATH_LABELS[path].toLowerCase()})` : outcome.message)
      } else toastError(outcome.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card pad={false} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{device.name}</span>
          {device.verified
            ? <Tag tone="verde"><ShieldCheck size={11} /> {t('sync.device.verified')}</Tag>
            : <Tag tone="ember"><ShieldAlert size={11} /> {t('sync.device.unverified')}</Tag>}
          <Tag>{device.role}</Tag>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-faint">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${syncFreshness(device, t).color}`} title={syncFreshness(device, t).label} />
          {device.lastSyncAt ? t('sync.device.lastSync', { date: new Date(device.lastSyncAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }) : t('sync.device.notSyncedYet')}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="primary" onClick={doCloudSync} disabled={!cap.sync || syncing} title={cap.sync ? 'Sync via Cloud Server' : cap.reasonUnavailable}>
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? t('sync.device.cloudSyncBusy') : t('sync.device.cloudSyncBtn')}
        </Button>
        <Button size="sm" variant="secondary" onClick={createPacket} title="Create an encrypted packet to send this device">
          <Download size={14} /> {t('sync.device.localExportBtn')}
        </Button>
        <input
          ref={fileRef}
          type="file" accept=".cwsync,application/octet-stream" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        />
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} title="Apply a packet you received from this device">
          <Upload size={14} /> {t('sync.device.localImportBtn')}
        </Button>
        <Button size="sm" variant="ghost" className="text-ember-600" onClick={async () => { await devicesRepo.remove(device.id); toast(t('sync.toast.unpaired')) }} title="Unpair">
          <Trash2 size={14} />
        </Button>
      </div>
    </Card>
  )
}

const getDeviceFilters = (t: (k: MessageKey) => string) => [
  { value: 'all', label: t('sync.filter.all') },
  { value: 'verified', label: t('sync.filter.verified') },
  { value: 'unverified', label: t('sync.filter.unverified') },
]

export default function SyncCenterPage() {
  const [identity, setIdentity] = useState<SyncIdentity | null>(null)
  const [pairOpen, setPairOpen] = useState(false)
  const [deviceFilter, setDeviceFilter] = useState('all')
  const devices = useLiveQuery(() => devicesRepo.all(), [], [])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const cap = cloudCapabilities(trainer)
  const { t } = useTranslation()

  const shownDevices = devices.filter(d =>
    deviceFilter === 'all' || (deviceFilter === 'verified' ? d.verified : !d.verified),
  )
  const unverifiedCount = devices.filter(d => !d.verified).length
  const backupDays = daysSince(trainer?.lastBackupAt)

  useEffect(() => { getIdentity().then(setIdentity) }, [])

  // The code carries identity (always) plus transport hints (when a relay is
  // actually usable on the current tier) — so a client scanning the QR pairs
  // AND gets the server address in one step instead of typing it by hand.
  const myCode = identity
    ? encodePairingCode({
        v: 1, deviceId: identity.deviceId, name: identity.name, role: 'coach', pub: identity.publicJwk,
        ...(cap.sync && trainer?.syncServerUrl ? { relay: trainer.syncServerUrl, relayKey: trainer.syncServerApiKey || undefined } : {}),
      })
    : ''

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader title={t('sync.title')} action={<Button variant="primary" onClick={() => setPairOpen(true)} disabled={!identity}><Link2 size={14} /> {t('sync.pairBtn')}</Button>} />

      <div className="space-y-6">
        {/* Every number here comes straight off `devices`/`trainer` — no
            invented "connected now" state, since a local-first app with no
            persistent connection has no way to know that live. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><Stat label={t('sync.stat.paired')} value={devices.length} /></Card>
          <Card><Stat label={t('sync.stat.verified')} value={devices.length - unverifiedCount} /></Card>
          <Card>
            <Stat
              label={t('sync.stat.lastBackup')}
              value={backupDays == null ? t('sync.stat.never') : backupDays === 0 ? t('sync.stat.today') : t('sync.stat.daysAgo', { days: String(backupDays) })}
              tone={backupDays != null && backupDays > 7 ? 'ember' : 'verde'}
            />
          </Card>
          <Card><Stat label={t('sync.stat.needsAttention')} value={unverifiedCount} tone={unverifiedCount > 0 ? 'ember' : 'ink'} /></Card>
        </div>

        {/* Renders nothing unless there IS a conflict, so it costs a coach who
            never hits one no attention at all — but when two devices disagree
            it is the first thing on the page, above the sync controls. */}
        <ConflictsCard />

        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <RadioTower size={16} className="text-verde-600" /> {t('sync.secure.title')}
          </div>
          <p className="text-xs text-muted">
            {t('sync.secure.body')}
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-ctl border border-line bg-surface2 px-3 py-2 text-2xs text-muted">
            <Wifi size={13} className="text-verde-600" />
            {t('sync.secure.wifi')}
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <Cloud size={16} className="text-verde-600" /> {t('sync.server.title')}
          </div>
          <p className="text-xs text-muted mb-4">
            {t('sync.server.body')}
          </p>
          {cap.tier === 'local' && (
            <p className="mb-4 rounded-ctl border border-line bg-surface2 px-3 py-2 text-2xs text-muted">
              {t('sync.server.localWarning')}
            </p>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-3">
              <Field label={t('sync.server.urlLabel')}>
                <Input 
                  type="url" 
                  placeholder={t('sync.server.urlPlaceholder')} 
                  defaultValue={trainer?.syncServerUrl || ''}
                  onBlur={e => trainerRepo.patch({ syncServerUrl: e.target.value })}
                />
              </Field>
              <Field label={t('sync.server.keyLabel')}>
                <Input 
                  type="password" 
                  placeholder={t('sync.server.keyPlaceholder')} 
                  defaultValue={trainer?.syncServerApiKey || ''}
                  onBlur={e => trainerRepo.patch({ syncServerApiKey: e.target.value })}
                />
              </Field>
            </div>
            <Button variant="secondary" onClick={() => toast(t('sync.toast.serverSaved'))}><Save size={14} className="me-1.5" /> {t('sync.server.saveBtn')}</Button>
          </div>
        </Card>

        <Card>
          <p className="mb-1 text-sm font-semibold text-ink">{t('sync.code.title')}</p>
          <p className="mb-3 text-xs text-muted">
            {t('sync.code.body')}
          </p>
          <div className="flex flex-wrap items-start gap-4">
            {myCode && (
              <div className="rounded-card border border-line bg-white p-3">
                <QRCodeSVG value={myCode} size={168} level="M" />
              </div>
            )}
            <div className="min-w-[240px] flex-1">
              <Textarea readOnly value={myCode} className="h-24 font-mono text-2xs" onFocus={e => e.currentTarget.select()} />
              <div className="mt-2 flex justify-end"><CopyButton text={myCode} label={t('sync.copy.label')} /></div>
              {cap.sync && trainer?.syncServerUrl && (
                <p className="mt-1 text-2xs text-faint">
                  {t('sync.code.warning', { key: trainer.syncServerApiKey ? t('sync.code.keyIncluded') : '' })}
                </p>
              )}
            </div>
          </div>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted">{t('sync.list.title')}</p>
            {devices.length > 0 && (
              <SegmentedControl options={getDeviceFilters(t)} value={deviceFilter} onChange={setDeviceFilter} />
            )}
          </div>
          {devices.length === 0 ? (
            <EmptyState
              icon={<RadioTower size={28} strokeWidth={1.5} />}
              title={t('sync.empty.title')}
              body={t('sync.empty.body')}
              action={<Button variant="primary" onClick={() => setPairOpen(true)} disabled={!identity}><Link2 size={14} /> {t('sync.pairBtn')}</Button>}
            />
          ) : shownDevices.length === 0 ? (
            <p className="rounded-ctl border border-dashed border-line px-4 py-6 text-center text-xs text-faint">
              {t('sync.list.emptyFilter', { filter: deviceFilter })}
            </p>
          ) : (
            <div className="space-y-2">
              {shownDevices.map(d => <DeviceRow key={d.id} device={d} trainer={trainer} />)}
            </div>
          )}
        </div>
      </div>

      <PairDialog open={pairOpen} onClose={() => setPairOpen(false)} myPublic={identity?.publicJwk} />
    </div>
  )
}
