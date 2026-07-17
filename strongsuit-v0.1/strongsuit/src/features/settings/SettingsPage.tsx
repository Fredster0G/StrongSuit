import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ShieldCheck, Upload, Download, Zap, Plus, Trash2, LayoutGrid } from 'lucide-react'
import { trainerRepo, automationRulesRepo } from '@/db/repo'
import { exportBackup, importBackup, isEncryptedBackup, downloadText, type ImportMode } from '@/db/backup'
import { fullName, nowIso } from '@/lib/core'
import { BACKUP_ACCEPT } from '@/lib/brand'
import { Button, Card, SectionHeader, Field, Input, Select, toast, toastError, Dialog, Tag } from '@/design'
import { clientsRepo } from '@/db/repo'
import { DEFAULT_RULES, TRIGGER_LABELS } from '@/lib/automations'
import type { AutomationTrigger, ModuleKey } from '@/db/types'
import Guide from './Guide'
import CloudCard from './CloudCard'

const MODULE_INFO: { key: ModuleKey; label: string; hint: string }[] = [
  { key: 'filmRoom', label: 'Film Room', hint: 'Video analysis & on-device movement tracking' },
  { key: 'calendar', label: 'Calendar', hint: 'Appointments & recurring bookings' },
  { key: 'business', label: 'Business', hint: 'Profit Planner, expenses, ledger' },
  { key: 'team', label: 'Team', hint: 'Staff roster, locations, commissions — hide if you\'re solo' },
  { key: 'leads', label: 'Leads', hint: 'CRM inquiry pipeline' },
  { key: 'leaderboard', label: 'Leaderboards', hint: 'Cross-client rankings & challenges' },
  { key: 'sync', label: 'Studio Link', hint: 'Device pairing & sync' },
  { key: 'reports', label: 'Reports', hint: 'Cross-client analytics' },
]

function ModulesCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  if (!trainer) return null
  const hidden = new Set(trainer.hiddenModules ?? [])

  async function toggle(key: ModuleKey) {
    const next = new Set(trainer!.hiddenModules ?? [])
    if (next.has(key)) next.delete(key); else next.add(key)
    await trainerRepo.patch({ hiddenModules: Array.from(next) })
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <LayoutGrid size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">Modules</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        Independent coaches don't need a Team roster or a Leads pipeline — hide what you don't use. Hidden modules stay off the sidebar and command palette; your data isn't deleted, and you can turn anything back on any time.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODULE_INFO.map(m => (
          <label key={m.key} className="flex items-start gap-2.5 rounded-ctl border border-line px-3 py-2.5">
            <input
              type="checkbox" checked={!hidden.has(m.key)} onChange={() => toggle(m.key)}
              className="mt-0.5 accent-[var(--verde-600)]"
            />
            <span>
              <span className="block text-sm font-medium text-ink">{m.label}</span>
              <span className="block text-2xs text-faint">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </Card>
  )
}

function BrandCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  if (!trainer) return null
  return (
    <Card>
      <p className="mb-3 font-display text-base font-semibold">Brand kit</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business name">
          <Input
            defaultValue={trainer.businessName}
            onBlur={e => trainerRepo.patch({ businessName: e.target.value })}
            placeholder="e.g. Keeling Performance"
          />
        </Field>
        <Field label="Your name">
          <Input defaultValue={trainer.trainerName} onBlur={e => trainerRepo.patch({ trainerName: e.target.value })} />
        </Field>
        <Field label="Units">
          <Select value={trainer.units} onChange={e => trainerRepo.patch({ units: e.target.value as 'lb' | 'kg' })}>
            <option value="lb">Pounds (lb)</option>
            <option value="kg">Kilograms (kg)</option>
          </Select>
        </Field>
        <Field label="Theme">
          <Select
            value={trainer.theme}
            onChange={e => {
              const theme = e.target.value as 'light' | 'dark' | 'system'
              trainerRepo.patch({ theme })
              const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
              document.documentElement.classList.toggle('dark', dark)
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </Field>
      </div>
      <p className="mt-3 text-2xs text-faint">Your brand appears on printed programs and every Companion file you send to clients.</p>
    </Card>
  )
}

function AddRuleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    name: '', trigger: 'no-session-days' as AutomationTrigger,
    thresholdDays: '7', thresholdSessions: '2', message: '',
  })
  const needsDays = form.trigger === 'no-session-days' || form.trigger === 'checkin-overdue-days' || form.trigger === 'payment-overdue-days'
  const needsCount = form.trigger === 'package-low-sessions'
  const placeholder = needsDays ? 'No session in {days} days' : needsCount ? '{count} sessions left' : 'Needs attention'

  async function save() {
    if (!form.name.trim()) return
    await automationRulesRepo.create({
      name: form.name.trim(), trigger: form.trigger,
      thresholdDays: needsDays ? Number(form.thresholdDays) || 7 : undefined,
      thresholdSessions: needsCount ? Number(form.thresholdSessions) || 2 : undefined,
      message: form.message.trim() || placeholder,
      active: true,
    })
    toast(`"${form.name}" rule added.`)
    setForm({ name: '', trigger: 'no-session-days', thresholdDays: '7', thresholdSessions: '2', message: '' })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add automation rule" width={460}>
      <div className="space-y-3">
        <Field label="Name"><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Payment reminder" /></Field>
        <Field label="Trigger">
          <Select value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value as AutomationTrigger }))}>
            {Object.entries(TRIGGER_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        {needsDays && (
          <Field label="Days"><Input type="number" min="1" value={form.thresholdDays} onChange={e => setForm(f => ({ ...f, thresholdDays: e.target.value }))} className="font-mono tnum" /></Field>
        )}
        {needsCount && (
          <Field label="Sessions remaining"><Input type="number" min="0" value={form.thresholdSessions} onChange={e => setForm(f => ({ ...f, thresholdSessions: e.target.value }))} className="font-mono tnum" /></Field>
        )}
        <Field label="Message" hint={`use ${needsDays ? '{days}' : needsCount ? '{count}' : 'plain text'} for the live number`}>
          <Input value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder={placeholder} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>Add rule</Button>
        </div>
      </div>
    </Dialog>
  )
}

function AutomationsCard() {
  const [addOpen, setAddOpen] = useState(false)
  const rules = useLiveQuery(() => automationRulesRepo.all(), [], [])

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Zap size={16} className="text-verde-600" /><p className="font-display text-base font-semibold">Automations</p></div>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Add rule</Button>
      </div>
      <p className="mb-3 text-xs text-muted">
        Rules re-check your local data every time the dashboard opens and surface a "needs attention" card — there's no background job, no server, and nothing runs while the app is closed.
      </p>
      <div className="mb-3">
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-faint">Always on</p>
        <div className="space-y-1">
          {DEFAULT_RULES.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2 text-sm">
              <span className="text-ink">{r.name}</span>
              <Tag>{TRIGGER_LABELS[r.trigger]}</Tag>
            </div>
          ))}
        </div>
      </div>
      {rules.length > 0 && (
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-faint">Your rules</p>
          <div className="space-y-1">
            {rules.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2 text-sm">
                <div>
                  <span className="text-ink">{r.name}</span>
                  <span className="ml-2 text-2xs text-faint">{r.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => automationRulesRepo.update(r.id, { active: !r.active })} className="text-2xs text-muted hover:text-ink">
                    {r.active ? 'On' : 'Off'}
                  </button>
                  <button onClick={async () => { await automationRulesRepo.remove(r.id); toast('Rule removed.') }} className="text-faint hover:text-signal-600"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <AddRuleDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </Card>
  )
}

function BackupCard() {
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)

  async function backUp() {
    setBusy(true)
    try {
      const { filename, text } = await exportBackup(passphrase || undefined)
      downloadText(filename, text)
      await trainerRepo.patch({ lastBackupAt: nowIso() })
      toast(passphrase ? 'Encrypted backup downloaded.' : 'Backup downloaded.')
    } catch {
      toastError("Couldn't create the backup. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">Back up</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        Everything lives on this device — that's the point. A backup is one file holding all of it.
        Keep one somewhere safe, weekly.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1 max-w-xs">
          <Field label="Passphrase" hint="optional — encrypts the file">
            <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Leave blank for plain backup" />
          </Field>
        </div>
        <Button variant="primary" onClick={backUp} disabled={busy}>
          <Download size={14} /> {busy ? 'Building…' : 'Back up now'}
        </Button>
      </div>
      {passphrase && (
        <p className="mt-2 text-2xs text-ember-600">There is no passphrase recovery. If you lose it, the backup can't be opened.</p>
      )}
    </Card>
  )
}

function RestoreCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [passphrase, setPassphrase] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [confirmText, setConfirmText] = useState('')

  async function onFile(file: File) {
    const text = await file.text()
    if (isEncryptedBackup(text) && !passphrase) {
      toastError('This backup is encrypted — enter its passphrase first.')
      return
    }
    if (mode === 'replace') {
      setPendingFile(file)
      return
    }
    await executeRestore(file, text)
  }

  async function executeRestore(file: File, preloadedText?: string) {
    try {
      const text = preloadedText ?? await file.text()
      const report = await importBackup(text, mode, passphrase || undefined)
      const total = Object.values(report.perTable).reduce((n, t) => n + t.applied, 0)
      toast(`Restore complete — ${total} records ${mode === 'merge' ? 'merged' : 'restored'}.`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Couldn't import that file.")
    } finally {
      setPendingFile(null)
      setConfirmText('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Upload size={16} className="text-muted" />
        <p className="font-display text-base font-semibold">Restore</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How to restore">
          <Select value={mode} onChange={e => setMode(e.target.value as ImportMode)}>
            <option value="merge">Merge — newest record wins</option>
            <option value="replace">Replace everything</option>
          </Select>
        </Field>
        <Field label="Passphrase" hint="only if the backup is encrypted">
          <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
        </Field>
      </div>
      {mode === 'replace' && (
        <p className="mt-2 text-2xs text-signal-600">Replace wipes everything currently in the app before restoring. Use merge unless you're moving machines.</p>
      )}
      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept={BACKUP_ACCEPT}
          className="hidden"
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button onClick={() => fileRef.current?.click()}>Choose backup file…</Button>
      </div>

      <Dialog open={!!pendingFile} onClose={() => setPendingFile(null)} title="Replace everything?" width={400}>
        <div className="space-y-3">
          <p className="text-sm text-ink">
            This will wipe everything currently in the app before restoring the backup. This cannot be undone.
          </p>
          <Field label='Type "RESTORE" to confirm'>
            <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="RESTORE" />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingFile(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => pendingFile && executeRestore(pendingFile)} disabled={confirmText !== 'RESTORE'}>
              Replace all data
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  )
}

function DataCard() {
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const [targetId, setTargetId] = useState('')
  const [confirmName, setConfirmName] = useState('')

  const targetClient = clients.find(c => c.id === targetId)

  async function wipeClient() {
    if (!targetClient) return
    await clientsRepo.hardDelete(targetClient.id)
    toast(`All data for ${fullName(targetClient)} has been wiped.`)
    setTargetId('')
    setConfirmName('')
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={16} className="text-ember-600" />
        <p className="font-display text-base font-semibold text-ember-600">Danger zone</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        Hard-delete a client and every piece of data attached to them (programs, logs, metrics). This cannot be undone.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 items-end">
        <Field label="Select client to wipe">
          <Select value={targetId} onChange={e => { setTargetId(e.target.value); setConfirmName('') }}>
            <option value="">-- Choose client --</option>
            {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </Select>
        </Field>
        {targetClient && (
          <Field label={`Type "${fullName(targetClient)}" to confirm`}>
            <Input 
              value={confirmName} 
              onChange={e => setConfirmName(e.target.value)} 
              placeholder={fullName(targetClient)} 
            />
          </Field>
        )}
      </div>
      {targetClient && (
        <div className="mt-3 flex justify-end">
          <Button 
            variant="ghost" 
            className="text-ember-600 hover:bg-ember-500/10 hover:text-ember-700"
            onClick={wipeClient} 
            disabled={confirmName !== fullName(targetClient)}
          >
            Permanently delete {fullName(targetClient)}
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Settings" />
      <BrandCard />
      <ModulesCard />
      <CloudCard />
      <AutomationsCard />
      <Guide />
      <BackupCard />
      <RestoreCard />
      <DataCard />
    </div>
  )
}
