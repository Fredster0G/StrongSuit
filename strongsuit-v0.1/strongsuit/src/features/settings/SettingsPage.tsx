import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ShieldCheck, Upload, Download } from 'lucide-react'
import { trainerRepo } from '@/db/repo'
import { exportBackup, importBackup, isEncryptedBackup, downloadText, type ImportMode } from '@/db/backup'
import { fullName, nowIso } from '@/lib/core'
import { Button, Card, SectionHeader, Field, Input, Select, toast, toastError, Dialog } from '@/design'
import { clientsRepo } from '@/db/repo'

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
          accept=".strongsuit,application/json"
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
            className="text-ember-600 hover:bg-ember-50 hover:text-ember-700 dark:hover:bg-ember-900/20" 
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
      <BackupCard />
      <RestoreCard />
      <DataCard />
    </div>
  )
}
