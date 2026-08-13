import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Unlink } from 'lucide-react'
import { Button, Card, Input, Label } from '@/design'
import { coachLinkRepo } from '@/db/repo'
import { PairingFlow } from '@/features/sync/PairingFlow'
import type { CoachLink } from '@/db/types'

/** Pairing status + connection settings only — the message thread and the
 *  sync actions themselves live on the Coach tab. This card is where the
 *  addresses a coach hands out get corrected later (they moved servers,
 *  switched hosting tiers, got a new studio IP…) WITHOUT re-pairing: the
 *  cryptographic pairing survives any transport change (strategy doc §7). */
export function CoachCard() {
  const [coachLink, setCoachLink] = useState<CoachLink | undefined>()
  const [pairing, setPairing] = useState(false)

  const refresh = () => { coachLinkRepo.get().then(setCoachLink) }
  useEffect(() => { refresh() }, [])

  async function unpair() {
    if (!coachLink) return
    await coachLinkRepo.remove(coachLink.id)
    refresh()
  }

  const patch = (changes: Partial<CoachLink>) => {
    if (!coachLink) return
    coachLinkRepo.patch(coachLink.id, changes).then(refresh)
  }

  if (pairing) {
    return (
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Link2 size={16} className="text-verde-600" />
          <p className="font-display text-base font-semibold text-ink">Pair with your coach</p>
        </div>
        <PairingFlow onPaired={() => { setPairing(false); refresh() }} onSkip={() => setPairing(false)} />
      </Card>
    )
  }

  if (!coachLink) {
    return (
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Link2 size={16} className="text-verde-600" />
          <p className="font-display text-base font-semibold text-ink">Coach</p>
        </div>
        <p className="mb-3 text-xs text-muted">Not paired with a coach yet.</p>
        <Button variant="primary" className="w-full" onClick={() => setPairing(true)}>Pair with a coach</Button>
      </Card>
    )
  }

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-verde-600" />
          <p className="font-display text-base font-semibold text-ink">Coach</p>
        </div>
        <button
          onClick={unpair} aria-label="Unpair" title="Unpair — your own logs and history stay on this device"
          className="-m-2 flex h-11 w-11 items-center justify-center p-2"
        >
          <Unlink size={16} className="text-faint hover:text-ember-600" />
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">
        Paired with {coachLink.coachName}. Messages and syncing live on the{' '}
        <Link to="/coach" className="text-verde-600 hover:underline">Coach tab</Link>.
      </p>

      <div className="space-y-2">
        <div>
          <Label>Server address (if your coach has one)</Label>
          <Input
            defaultValue={coachLink.relayUrl ?? ''} placeholder="https://…" inputMode="url"
            onBlur={e => patch({ relayUrl: e.target.value.trim() || undefined })}
          />
        </div>
        <div>
          <Label>Server key (only if self-hosted)</Label>
          <Input
            type="password" defaultValue={coachLink.relayApiKey ?? ''} placeholder="Leave blank for managed hosting"
            onBlur={e => patch({ relayApiKey: e.target.value.trim() || undefined })}
          />
        </div>
        <div>
          <Label>WiFi sync address (their desktop app, same network)</Label>
          <Input
            defaultValue={coachLink.lanUrl ?? ''} placeholder="http://192.168.1.20:4000" inputMode="url"
            onBlur={e => patch({ lanUrl: e.target.value.trim() || undefined })}
          />
        </div>
      </div>
      <p className="mt-2 text-2xs text-faint">
        No addresses at all? Still fine — exchange encrypted packet files from the Coach tab. Unpairing never deletes your own workout history.
      </p>
    </Card>
  )
}
