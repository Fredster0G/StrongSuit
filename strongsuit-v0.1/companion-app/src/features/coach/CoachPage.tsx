import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Download, Link2, RefreshCw, Send, Upload, Wifi } from 'lucide-react'
import { Button, Card, EmptyState, Input, Label } from '@/design'
import { coachLinkRepo, messagesRepo, assignedProgramsRepo } from '@/db/repo'
import { downloadText } from '@/db/backup'
import {
  syncNow, syncOverLan, pushMessageToCoach, exportLogsFile, importCoachPacketText,
} from '@/features/sync/companionSyncApi'
import { pendingP2pOffer, syncOverP2p } from '@/features/sync/p2pClient'
import { PATH_LABELS } from '@/lib/p2pProtocol'
import { PairingFlow } from '@/features/sync/PairingFlow'
import type { CoachLink, CoachMessage } from '@/db/types'

/** The whole coach relationship on one screen: the message thread, plus
 *  every way of syncing that this pairing supports. Which controls show is
 *  decided by what's actually configured — a relay URL unlocks "Sync now",
 *  a saved LAN address unlocks one-tap WiFi sync, and the file export/import
 *  pair is always there because it works on every tier including "coach has
 *  no server at all" (docs/CLIENT_APP_STRATEGY.md §7). */
export function CoachPage() {
  const [coachLink, setCoachLink] = useState<CoachLink | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [pairing, setPairing] = useState(false)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [hasProgram, setHasProgram] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'' | 'relay' | 'lan'>('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [lanDraft, setLanDraft] = useState('')
  const [showLan, setShowLan] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const refresh = () => {
    coachLinkRepo.get().then(l => { setCoachLink(l); setLoaded(true); if (l?.lanUrl) setLanDraft(l.lanUrl) })
    messagesRepo.all().then(setMessages)
    assignedProgramsRepo.display().then(p => setHasProgram(p.length > 0))
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }) }, [messages.length])

  async function doRelaySync() {
    if (!coachLink) return
    setBusy('relay'); setError(''); setStatus('')
    try {
      // If the coach is calling right now, answer directly — it's faster and
      // nothing goes through their server. This is opportunistic only:
      // `pendingP2pOffer` never throws, and any P2P failure falls through to
      // the ordinary relay sync below rather than surfacing to the user.
      // P2P needs both devices awake, which coaching mostly isn't, so the
      // relay stays the path that actually carries the work.
      const offer = await pendingP2pOffer(coachLink)
      if (offer) {
        try {
          const direct = await syncOverP2p(coachLink, offer)
          setStatus(`${summary(direct.programs, direct.messages)} (${PATH_LABELS[direct.path].toLowerCase()})`)
          refresh()
          return
        } catch {
          // Fall through to the relay. A direct connection is an
          // optimisation; failing it must never mean failing to sync.
        }
      }
      const r = await syncNow(coachLink)
      setStatus(summary(r.programs, r.pulled))
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sync.")
    } finally { setBusy('') }
  }

  async function doLanSync() {
    if (!coachLink || !lanDraft.trim()) return
    setBusy('lan'); setError(''); setStatus('')
    try {
      const r = await syncOverLan(coachLink, lanDraft)
      setStatus(r.replayed ? 'Already up to date.' : summary(r.programs, r.messages))
      setShowLan(false)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sync over WiFi.")
    } finally { setBusy('') }
  }

  async function exportFile() {
    if (!coachLink) return
    setError('')
    try {
      const { filename, text } = await exportLogsFile(coachLink)
      downloadText(filename, text)
      setStatus('Packet exported — send the file to your coach any way you like.')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't export.")
    }
  }

  async function importFile(f: File) {
    if (!coachLink) return
    setError(''); setStatus('')
    try {
      const r = await importCoachPacketText(coachLink, await f.text())
      setStatus(r.replayed ? 'Already applied — nothing new in that packet.' : summary(r.programs, r.messages))
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that packet.")
    }
  }

  async function send() {
    if (!coachLink || !draft.trim()) return
    setError('')
    try {
      const delivered = await pushMessageToCoach(coachLink, draft.trim())
      if (!delivered) setStatus('Saved — goes out with your next sync.')
      setDraft('')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.")
      refresh() // the message row was still saved locally
    }
  }

  if (!loaded) return null

  if (pairing) {
    return (
      <div className="space-y-4">
        <PageTitle />
        <PairingFlow onPaired={() => { setPairing(false); refresh() }} onSkip={() => setPairing(false)} />
      </div>
    )
  }

  if (!coachLink) {
    return (
      <div className="space-y-4">
        <PageTitle />
        <EmptyState
          icon={<Link2 size={28} strokeWidth={1.5} />}
          title="No coach paired"
          body="Training with a coach? Pair once and your logged workouts, check-ins, and messages travel between you — end-to-end encrypted, whatever their setup."
        />
        <Button variant="primary" className="w-full" onClick={() => setPairing(true)}>Pair with a coach</Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">Your coach</p>
          <h1 className="font-display text-lg font-semibold text-ink">{coachLink.coachName}</h1>
        </div>
        <div className="text-right text-2xs text-faint">
          {coachLink.lastSyncAt
            ? <>Last synced<br />{new Date(coachLink.lastSyncAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</>
            : 'Not synced yet'}
        </div>
      </div>

      {hasProgram && (
        <Link to="/program">
          <Card className="flex items-center gap-2 py-2.5 text-sm text-ink hover:border-verde-600">
            <ClipboardList size={16} className="text-verde-600" />
            View your assigned program
          </Card>
        </Link>
      )}

      <div className="flex flex-wrap gap-2">
        {coachLink.relayUrl && (
          <Button variant="primary" className="flex-1" onClick={doRelaySync} disabled={!!busy}>
            <RefreshCw size={14} className={busy === 'relay' ? 'animate-spin' : ''} /> {busy === 'relay' ? 'Syncing…' : 'Sync now'}
          </Button>
        )}
        <Button variant="secondary" className="flex-1" onClick={() => setShowLan(v => !v)}>
          <Wifi size={14} /> WiFi sync
        </Button>
        <Button variant="secondary" onClick={exportFile} aria-label="Export packet" title="Export a sync file to send your coach">
          <Download size={14} />
        </Button>
        <input
          ref={fileRef} type="file" accept=".cwsync,application/octet-stream,text/plain" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} aria-label="Import packet" title="Apply a sync file your coach sent you">
          <Upload size={14} />
        </Button>
      </div>

      {showLan && (
        <Card>
          <Label>Coach's WiFi sync address</Label>
          <p className="mb-2 text-2xs text-muted">
            On the same WiFi as your coach? Ask them to open WiFi Sync in their desktop app — enter the address under their QR code. No internet, no server: your phone talks straight to their computer.
          </p>
          <div className="flex gap-2">
            <Input value={lanDraft} onChange={e => setLanDraft(e.target.value)} placeholder="http://192.168.1.20:4000" inputMode="url" />
            <Button variant="primary" onClick={doLanSync} disabled={!lanDraft.trim() || !!busy}>
              {busy === 'lan' ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
        </Card>
      )}

      {!coachLink.relayUrl && !coachLink.lanUrl && (
        <p className="text-2xs text-faint">
          This coach has no server — that's fine. Messages and logs queue up here and travel whenever you sync: over WiFi at the gym, or as an exported file.
        </p>
      )}
      {status && <p className="text-2xs text-verde-600">{status}</p>}
      {error && <p className="text-2xs text-signal-600">{error}</p>}

      <div ref={threadRef} className="flex-1 space-y-1.5 overflow-y-auto rounded-card border border-line bg-surface2/50 p-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">No messages yet — say hi.</p>
        ) : messages.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'to-coach' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-ctl px-3 py-2 text-sm ${m.direction === 'to-coach' ? 'bg-verde-600 text-white' : 'border border-line bg-surface text-ink'}`}>
              <p>{m.content}</p>
              <p className={`mt-0.5 text-2xs ${m.direction === 'to-coach' ? 'text-white/70' : 'text-faint'}`}>
                {new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pb-1">
        <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Message your coach…" onKeyDown={e => { if (e.key === 'Enter') send() }} />
        <Button variant="primary" onClick={send} disabled={!draft.trim()} aria-label="Send"><Send size={16} /></Button>
      </div>
    </div>
  )
}

function PageTitle() {
  return (
    <div>
      <p className="text-xs text-muted">Coach</p>
      <h1 className="font-display text-xl font-semibold text-ink">Train together</h1>
    </div>
  )
}

function summary(programs: number, messages: number): string {
  const parts: string[] = []
  if (programs) parts.push(`${programs} program${programs === 1 ? '' : 's'} updated`)
  if (messages) parts.push(`${messages} new message${messages === 1 ? '' : 's'}`)
  return parts.length ? `Synced — ${parts.join(', ')}.` : 'Synced — everything already up to date.'
}
