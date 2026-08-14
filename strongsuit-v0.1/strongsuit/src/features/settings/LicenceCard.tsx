import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { KeyRound, Check, Sparkles } from 'lucide-react'
import { Button, Card, Textarea, Tag, toast } from '@/design'
import { trainerRepo } from '@/db/repo'
import {
  verifyLicence, isFoundingMember, ownershipYears, isAnniversary,
  type LicenceStatus,
} from '@/lib/licence'
import { EDITION_NAMES } from '@/lib/edition'

/**
 * Enter/replace a licence key (plan §4.5–4.6). Verification is entirely
 * offline — `verifyLicence` only ever checks the key against the public key
 * baked into this build, never a network call — so this card works exactly
 * the same with the machine offline as it does online, which is the whole
 * point of `lib/licence.ts`'s "no activation server" promise.
 *
 * A verified key immediately becomes the trainer's real `edition` and
 * `licensedSeats` — this is the one place in the app that writes those
 * fields from anything other than `trainerRepo.getOrCreate()`'s default.
 */
export function LicenceCard() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const [input, setInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<LicenceStatus | null>(null)

  // Re-verify whatever key is already on file, so "Licensed to" reflects a
  // key that still actually verifies — not just "a string is stored".
  useEffect(() => {
    if (!trainer?.licenseKey) { setStatus(null); return }
    let cancelled = false
    verifyLicence(trainer.licenseKey).then(s => { if (!cancelled) setStatus(s) })
    return () => { cancelled = true }
  }, [trainer?.licenseKey])

  if (!trainer) return null

  async function activate() {
    const key = input.trim()
    if (!key) return
    setChecking(true)
    try {
      const result = await verifyLicence(key)
      setStatus(result)
      if (result.valid) {
        await trainerRepo.patch({
          edition: result.claims.edition,
          licenseKey: key,
          licensedSeats: result.claims.seats,
        })
        setInput('')
        toast(`Licensed to ${result.claims.name} — ${EDITION_NAMES[result.claims.edition]}.`)
      }
    } finally {
      setChecking(false)
    }
  }

  const activeClaims = status?.valid ? status.claims : null

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <KeyRound size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold text-ink">Licence</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        Verified entirely on this machine — no account, no internet required. The key never leaves your
        computer and nothing about activating it is sent anywhere.
      </p>

      {activeClaims ? (
        <div className="mb-3 rounded-ctl border border-line bg-surface2 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Check size={13} className="text-verde-600" />
            <p className="text-sm text-ink">
              Licensed to <span className="font-medium">{activeClaims.name}</span>
            </p>
            <Tag tone="verde">{EDITION_NAMES[activeClaims.edition]}</Tag>
            {isFoundingMember(activeClaims) && <Tag tone="ember">Founding Member</Tag>}
          </div>
          <p className="mt-1 text-2xs text-faint">
            Purchased {activeClaims.issuedAt}
            {ownershipYears(activeClaims) > 0 && ` · owned ${ownershipYears(activeClaims)} year${ownershipYears(activeClaims) === 1 ? '' : 's'}`}
            {activeClaims.edition === 'studio' && activeClaims.seats ? ` · ${activeClaims.seats} seats` : ''}
          </p>
          {isAnniversary(activeClaims) && (
            <p className="mt-1.5 flex items-center gap-1 text-2xs text-verde-600">
              <Sparkles size={12} /> Happy anniversary — everything shipped this year is already yours, free.
            </p>
          )}
        </div>
      ) : trainer.licenseKey ? (
        <p className="mb-3 text-xs text-signal-600">
          The saved key no longer verifies{status && !status.valid ? ` (${status.reason})` : ''}. Paste it again below, or
          enter a new one.
        </p>
      ) : (
        <p className="mb-3 text-xs text-faint">
          No licence on file — running as {EDITION_NAMES[trainer.edition ?? 'independent']}. Paste a licence key below
          to activate.
        </p>
      )}

      <Textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="CW1...."
        className="font-mono text-xs"
        rows={2}
      />
      {status && !status.valid && input.trim() && (
        <p className="mt-1 text-2xs text-signal-600">{status.reason}</p>
      )}
      <div className="mt-2 flex justify-end">
        <Button variant="primary" size="sm" onClick={activate} disabled={checking || !input.trim()}>
          {checking ? 'Checking…' : 'Activate'}
        </Button>
      </div>
    </Card>
  )
}
