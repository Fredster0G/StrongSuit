import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { HardDrive, Server, Cloud, Check } from 'lucide-react'
import { trainerRepo } from '@/db/repo'
import { Card, Field, Input, Button, Tag, toast } from '@/design'
import { APP_NAME } from '@/lib/brand'

type Tier = 'local' | 'self-hosted' | 'managed'

const TIERS: { id: Tier; icon: typeof HardDrive; title: string; price: string; body: string }[] = [
  {
    id: 'local', icon: HardDrive, title: 'Fully local', price: 'Free, forever',
    body: 'Everything stays on this device. Move data between your own devices with a backup file or a paired WiFi/LAN transfer — no server, anywhere, ever.',
  },
  {
    id: 'self-hosted', icon: Server, title: 'Self-hosted relay', price: 'Free — you run the server',
    body: 'Run the open Coachwright relay yourself (a $5/mo VPS or even a spare Raspberry Pi is plenty for one studio) for always-on sync between your devices and your clients\' Companion apps, from anywhere. You control it end to end; we never see your data.',
  },
  {
    id: 'managed', icon: Cloud, title: 'Managed by us', price: '$15/mo',
    body: `We host and run the relay for you — zero setup. Same end-to-end encryption as self-hosting (we can't read your data even if we wanted to), plus it's what powers cloud reminders. Cancel any time; your data still works fully offline the moment you do.`,
  },
]

export default function CloudCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const [keyDraft, setKeyDraft] = useState('')
  if (!trainer) return null
  const tier: Tier = trainer.cloudTier ?? 'local'

  async function selectTier(next: Tier) {
    await trainerRepo.patch({ cloudTier: next })
    toast(next === 'local' ? 'Switched to fully local — no server involved.' : next === 'self-hosted' ? 'Self-hosted relay selected — set your server URL on the Studio Link page.' : 'Managed hosting selected.')
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Cloud size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">Hosting & sync</p>
      </div>
      <p className="mb-4 text-xs text-muted">
        {APP_NAME} never requires a server — every feature works with the network off. Syncing devices or clients in real time over the internet is the one thing that benefits from one, so it's the one thing we make fully optional, in three honest flavors.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {TIERS.map(t => {
          const Icon = t.icon
          const active = tier === t.id
          return (
            <button
              key={t.id} onClick={() => selectTier(t.id)}
              className={`flex flex-col gap-2 rounded-card border p-3 text-start transition-colors ${active ? 'border-verde-600 bg-verde-100/40' : 'border-line hover:bg-surface2'}`}
            >
              <div className="flex items-center justify-between">
                <Icon size={18} className={active ? 'text-verde-600' : 'text-faint'} />
                {active && <Check size={14} className="text-verde-600" />}
              </div>
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              <Tag tone={t.id === 'managed' ? 'ember' : 'verde'}>{t.price}</Tag>
              <p className="text-2xs text-muted">{t.body}</p>
            </button>
          )
        })}
      </div>

      {tier === 'managed' && (
        <div className="mt-4 border-t border-line pt-4">
          <Field label="Your license key" hint="from your Coachwright account — activates the managed relay">
            <div className="flex gap-2">
              <Input value={keyDraft || trainer.managedLicenseKey || ''} onChange={e => setKeyDraft(e.target.value)} placeholder="CW-XXXX-XXXX-XXXX" />
              <Button variant="primary" onClick={async () => { await trainerRepo.patch({ managedLicenseKey: keyDraft, syncServerUrl: 'https://relay.coachwright.app' }); toast('License key saved.') }}>Save</Button>
            </div>
          </Field>
          <p className="mt-2 text-2xs text-faint">
            Managed hosting is a separate, clearly-priced subscription — it never changes the one-time price of the app itself, and every byte it relays is end-to-end encrypted before it leaves this device (see the Studio Link guide section for how). If you cancel, self-hosting or fully local both keep working with everything you already have.
          </p>
        </div>
      )}
      {tier === 'self-hosted' && (
        <p className="mt-4 border-t border-line pt-4 text-2xs text-muted">
          Set your server's address on the <span className="font-medium text-ink">Studio Link</span> page ("Cloud Sync Server"). The reference relay is a small, open Express+SQLite server — see <code className="font-mono">docs/SERVER_STRATEGY.md</code> for the one-command self-host guide.
        </p>
      )}
    </Card>
  )
}
