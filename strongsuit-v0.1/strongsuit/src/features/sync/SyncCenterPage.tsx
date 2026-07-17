import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  RadioTower, Copy, Check, ShieldCheck, ShieldAlert, Upload, Download,
  Trash2, Link2, Wifi, Cloud, Save, RefreshCw
} from 'lucide-react'
import {
  Card, SectionHeader, Button, Field, Select, Textarea, Tag, EmptyState,
  Dialog, toast, toastError, Input
} from '@/design'
import { devicesRepo, clientsRepo, trainerRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import { downloadText } from '@/db/backup'
import {
  encodePairingCode, decodePairingCode, safetyNumber, type PairingCode,
} from '@/lib/sync'
import { getIdentity, pairDevice, buildPacket, applyPacket } from './syncApi'
import type { Device, SyncIdentity, Trainer } from '@/db/types'

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button size="sm" variant="secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }
      catch { toastError("Couldn't copy — select the text and copy manually.") }
    }}>
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? 'Copied' : label}
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
      setError(e instanceof Error ? e.message : 'Invalid code.')
    }
  }

  async function confirm() {
    if (!parsed) return
    await pairDevice(parsed, { verified: true, clientId: clientId || undefined })
    toast(`Paired with ${parsed.name}.`)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Pair a device" width={480}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Paste the pairing code from the other device. You'll both check a 6-digit safety number to be sure no one is in the middle.
        </p>
        <Field label="Their pairing code">
          <Textarea value={codeText} onChange={e => setCodeText(e.target.value)} placeholder="Paste code…" className="font-mono text-2xs" />
        </Field>
        {error && <p className="text-2xs text-signal-600">{error}</p>}
        {!parsed ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={check} disabled={!codeText.trim()}>Check code</Button>
          </div>
        ) : (
          <>
            <div className="rounded-card border border-line bg-surface2 p-3">
              <p className="text-xs text-muted">Pairing with <span className="font-medium text-ink">{parsed.name}</span> ({parsed.role})</p>
              <p className="mt-2 text-2xs font-medium uppercase tracking-wide text-faint">Safety number — read it aloud, confirm it matches on both screens</p>
              <p className="font-mono tnum text-2xl font-semibold tracking-widest text-verde-600">{sas}</p>
            </div>
            {parsed.role === 'client' && (
              <Field label="This device belongs to (client)" hint="scopes what syncs">
                <Select value={clientId} onChange={e => setClientId(e.target.value)}>
                  <option value="">— choose client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                </Select>
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setParsed(null)}>Back</Button>
              <Button variant="primary" onClick={confirm}>Numbers match — pair</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

function DeviceRow({ device, trainer, identity }: { device: Device; trainer: Trainer | undefined; identity: SyncIdentity }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [syncing, setSyncing] = useState(false)

  async function createPacket() {
    try {
      const { filename, text } = await buildPacket(device)
      downloadText(filename, text)
      toast(`Sync packet for ${device.name} created.`)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't create the packet.")
    }
  }

  async function onFile(f: File) {
    try {
      const text = await f.text()
      const r = await applyPacket(device, text)
      if (r.replayed) { toast('Already applied — nothing new in that packet.'); return }
      toast(`Synced from ${device.name}: ${r.applied} updated${r.skipped ? `, ${r.skipped} already current` : ''}.`)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't apply the packet.")
    }
  }

  async function doCloudSync() {
    if (!trainer?.syncServerUrl) return toastError('Configure a Cloud Sync Server URL first.')
    setSyncing(true)
    try {
      // 1. Build packet
      const { text } = await buildPacket(device)
      
      // 2. Push packet
      const apiKey = trainer.syncServerApiKey || 'default-coachwright-key'
      const pushRes = await fetch(`${trainer.syncServerUrl}/sync/push`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          id: identity.deviceId, // This is the coach's device ID
          type: 'coach',
          coachId: identity.deviceId, // Using coach's device ID as the unique cloud identifier for now
          encryptedPayload: text
        })
      })
      if (!pushRes.ok) throw new Error('Failed to push to server')

      // 3. Pull packet
      // In a real flow, the client pushes to 'client' type and coach pulls from 'client' type
      const pullRes = await fetch(`${trainer.syncServerUrl}/sync/pull/client/${device.id}`, {
        headers: {
          'x-api-key': apiKey
        }
      })
      if (!pullRes.ok) throw new Error('Failed to pull from server')
      
      const { encryptedPayload } = await pullRes.json()
      if (encryptedPayload) {
        const r = await applyPacket(device, encryptedPayload)
        if (r.replayed) {
          toast(`Pushed updates to Cloud. No new updates from ${device.name}.`)
        } else {
          toast(`Cloud Sync: ${r.applied} updated${r.skipped ? `, ${r.skipped} already current` : ''}.`)
        }
      } else {
        toast(`Pushed updates to Cloud. No inbound payload from ${device.name}.`)
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Cloud sync failed.")
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
            ? <Tag tone="verde"><ShieldCheck size={11} /> verified</Tag>
            : <Tag tone="ember"><ShieldAlert size={11} /> unverified</Tag>}
          <Tag>{device.role}</Tag>
        </div>
        <div className="mt-0.5 text-2xs text-faint">
          {device.lastSyncAt ? `Last sync ${new Date(device.lastSyncAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not synced yet'}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="primary" onClick={doCloudSync} disabled={!trainer?.syncServerUrl || syncing} title="Sync via Cloud Server">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing...' : 'Cloud Sync'}
        </Button>
        <Button size="sm" variant="secondary" onClick={createPacket} title="Create an encrypted packet to send this device">
          <Download size={14} /> Local Export
        </Button>
        <input
          ref={fileRef}
          type="file" accept=".cwsync,application/octet-stream" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        />
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} title="Apply a packet you received from this device">
          <Upload size={14} /> Local Import
        </Button>
        <Button size="sm" variant="ghost" className="text-ember-600" onClick={async () => { await devicesRepo.remove(device.id); toast('Device unpaired.') }} title="Unpair">
          <Trash2 size={14} />
        </Button>
      </div>
    </Card>
  )
}

export default function SyncCenterPage() {
  const [identity, setIdentity] = useState<SyncIdentity | null>(null)
  const [pairOpen, setPairOpen] = useState(false)
  const devices = useLiveQuery(() => devicesRepo.all(), [], [])
  const trainer = useLiveQuery(() => trainerRepo.get())

  useEffect(() => { getIdentity().then(setIdentity) }, [])

  const myCode = identity
    ? encodePairingCode({ v: 1, deviceId: identity.deviceId, name: identity.name, role: 'coach', pub: identity.publicJwk })
    : ''

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader title="Studio Link" action={<Button variant="primary" onClick={() => setPairOpen(true)} disabled={!identity}><Link2 size={14} /> Pair a device</Button>} />

      <div className="space-y-6">
        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <RadioTower size={16} className="text-verde-600" /> Secure device link
          </div>
          <p className="text-xs text-muted">
            Connect your devices — and clients running Coachwright — with end-to-end encryption. Keys are generated on each device and never leave it; there is no server in the middle. Move an encrypted packet over WiFi, AirDrop, or email and the other side merges it in. Newest edit always wins, so both sides stay in step.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-ctl border border-line bg-surface2 px-3 py-2 text-2xs text-muted">
            <Wifi size={13} className="text-verde-600" />
            Same-WiFi transfer works today by sharing the packet file. A live direct link is on the roadmap — the encryption is already in place for it.
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <Cloud size={16} className="text-verde-600" /> Cloud Sync Server
          </div>
          <p className="text-xs text-muted mb-4">
            If you or your studio runs a Coachwright Cloud Sync Server, enter its URL here. 
            All sync payloads are end-to-end encrypted before leaving this device. The server cannot read your data.
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-3">
              <Field label="Server URL">
                <Input 
                  type="url" 
                  placeholder="e.g., https://sync.coachwright.com" 
                  defaultValue={trainer?.syncServerUrl || ''}
                  onBlur={e => trainerRepo.patch({ syncServerUrl: e.target.value })}
                />
              </Field>
              <Field label="Server API Key">
                <Input 
                  type="password" 
                  placeholder="default-coachwright-key" 
                  defaultValue={trainer?.syncServerApiKey || ''}
                  onBlur={e => trainerRepo.patch({ syncServerApiKey: e.target.value })}
                />
              </Field>
            </div>
            <Button variant="secondary" onClick={() => toast('Saved Server Config')}><Save size={14} className="mr-1.5" /> Save</Button>
          </div>
        </Card>

        <Card>
          <p className="mb-1 text-sm font-semibold text-ink">This device's pairing code</p>
          <p className="mb-2 text-xs text-muted">Show or send this to the device you're pairing with.</p>
          <Textarea readOnly value={myCode} className="h-20 font-mono text-2xs" onFocus={e => e.currentTarget.select()} />
          <div className="mt-2 flex justify-end"><CopyButton text={myCode} label="Copy code" /></div>
        </Card>

        <div>
          <p className="mb-3 text-sm font-semibold text-muted">Paired devices</p>
          {devices.length === 0 ? (
            <EmptyState
              icon={<RadioTower size={28} strokeWidth={1.5} />}
              title="No devices paired yet"
              body="Pair your floor tablet, a second computer, or a client's device. Each pairing is verified with a safety number and encrypted end-to-end."
              action={<Button variant="primary" onClick={() => setPairOpen(true)} disabled={!identity}><Link2 size={14} /> Pair a device</Button>}
            />
          ) : (
            <div className="space-y-2">
              {devices.map(d => <DeviceRow key={d.id} device={d} trainer={trainer} identity={identity!} />)}
            </div>
          )}
        </div>
      </div>

      <PairDialog open={pairOpen} onClose={() => setPairOpen(false)} myPublic={identity?.publicJwk} />
    </div>
  )
}
