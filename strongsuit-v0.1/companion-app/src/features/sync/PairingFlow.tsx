import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, ScanLine } from 'lucide-react'
import { Button, Card, Input, Label } from '@/design'
import { profileRepo, coachLinkRepo } from '@/db/repo'
import { decodePairingCode, encodePairingCode, safetyNumber, type PairingCode } from '@/lib/sync'
import { QrScanner, qrScanSupported } from './QrScanner'
import type { CoachLink } from '@/db/types'

/** The real handshake: scan (or paste) the coach's code, derive the shared
 *  key, and require a spoken safety-number confirmation before saving a
 *  CoachLink — see docs/CLIENT_APP_STRATEGY.md §3.5. Scan-first: a coach's
 *  QR carries their identity AND their server address (S13 transport hints),
 *  so scanning pairs and configures sync in one step. This device's own code
 *  renders as a QR too, for the coach to scan back or to be pasted. */
export function PairingFlow({ onPaired, onSkip }: {
  onPaired: (link: CoachLink) => void
  onSkip?: () => void
}) {
  const [myCode, setMyCode] = useState('')
  const [coachCode, setCoachCode] = useState('')
  const [parsed, setParsed] = useState<PairingCode | null>(null)
  const [sas, setSas] = useState('')
  const [relayUrl, setRelayUrl] = useState('')
  const [relayApiKey, setRelayApiKey] = useState('')
  const [relayFromQr, setRelayFromQr] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [showMyQr, setShowMyQr] = useState(false)

  useEffect(() => {
    profileRepo.getOrCreateIdentity().then(identity => {
      setMyCode(encodePairingCode({ v: 1, deviceId: identity.deviceId, name: identity.name || 'Companion', role: 'client', pub: identity.publicJwk }))
    })
  }, [])

  async function accept(text: string) {
    setError('')
    try {
      const c = decodePairingCode(text)
      if (c.role !== 'coach') throw new Error("That's a client code, not a coach's — ask your coach for theirs.")
      setParsed(c)
      setCoachCode(text)
      setScanning(false)
      if (c.relay) {
        setRelayUrl(c.relay)
        setRelayApiKey(c.relayKey ?? '')
        setRelayFromQr(true)
      }
      const identity = await profileRepo.getOrCreateIdentity()
      setSas(await safetyNumber(identity.publicJwk, c.pub))
    } catch (e) {
      setParsed(null)
      setError(e instanceof Error ? e.message : 'Invalid code.')
    }
  }

  async function confirm() {
    if (!parsed) return
    setBusy(true)
    try {
      const link = await coachLinkRepo.create({
        coachDeviceId: parsed.deviceId,
        coachName: parsed.name,
        coachPublicJwk: parsed.pub,
        pending: false,
        relayUrl: relayUrl.trim() || undefined,
        relayApiKey: relayApiKey.trim() || undefined,
      })
      onPaired(link)
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(myCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard may be blocked — code is still selectable */ }
  }

  if (scanning) {
    return (
      <div className="space-y-3">
        <QrScanner onScan={accept} onClose={() => setScanning(false)} />
        {error && <p className="text-2xs text-signal-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!parsed && (
        <>
          {qrScanSupported() && (
            <Button variant="primary" className="w-full py-3" onClick={() => setScanning(true)}>
              <ScanLine size={16} /> Scan your coach's QR code
            </Button>
          )}
          <Card>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">
              {qrScanSupported() ? 'Or paste their code' : 'Paste their code'}
            </p>
            <textarea
              value={coachCode} onChange={e => setCoachCode(e.target.value)} placeholder="Paste your coach's code…"
              className="h-16 w-full rounded-ctl border border-line bg-surface p-2 font-mono text-2xs text-ink"
            />
            {error && <p className="mt-1 text-2xs text-signal-600">{error}</p>}
            <Button variant="secondary" className="mt-2 w-full" onClick={() => accept(coachCode)} disabled={!coachCode.trim()}>Check code</Button>
          </Card>
        </>
      )}

      {parsed && (
        <Card>
          <p className="text-xs text-muted">Pairing with <span className="font-medium text-ink">{parsed.name}</span></p>
          <div className="mt-2 rounded-ctl border border-line bg-surface2 p-3 text-center">
            <p className="text-2xs text-muted">Safety number — read it aloud, confirm it matches what your coach sees</p>
            <p className="font-mono tnum text-2xl font-semibold tracking-widest text-verde-600">{sas}</p>
          </div>
          {relayFromQr ? (
            <p className="mt-2 rounded-ctl bg-verde-600/10 px-3 py-2 text-2xs text-verde-600">
              Server address came with the QR — sync is configured, nothing to type.
            </p>
          ) : (
            <>
              <div className="mt-2">
                <Label>Their server address (optional)</Label>
                <Input value={relayUrl} onChange={e => setRelayUrl(e.target.value)} placeholder="https://… — leave blank if they don't have one" inputMode="url" />
                <p className="mt-1 text-2xs text-faint">No server? Still fine — you'll sync over WiFi or by file from the Coach tab.</p>
              </div>
              <div className="mt-2">
                <Label>Server key (only if self-hosted)</Label>
                <Input value={relayApiKey} onChange={e => setRelayApiKey(e.target.value)} placeholder="Leave blank for managed hosting" type="password" />
              </div>
            </>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => { setParsed(null); setRelayFromQr(false) }}>Back</Button>
            <Button variant="primary" className="flex-1" onClick={confirm} disabled={busy}>Numbers match — pair</Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Your code (for your coach)</p>
          <button className="text-2xs text-verde-600" onClick={() => setShowMyQr(v => !v)}>{showMyQr ? 'Hide QR' : 'Show as QR'}</button>
        </div>
        <p className="mb-2 mt-1 text-2xs text-muted">They'll add it on their Studio Link page — by scan or paste.</p>
        {showMyQr && myCode && (
          <div className="mb-2 flex justify-center rounded-card border border-line bg-white p-3">
            <QRCodeSVG value={myCode} size={180} level="M" />
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            readOnly value={myCode} onFocus={e => e.currentTarget.select()}
            className="h-14 flex-1 rounded-ctl border border-line bg-surface2 p-2 font-mono text-2xs text-ink"
          />
          <Button variant="secondary" onClick={copyCode} aria-label="Copy code">{copied ? <Check size={14} /> : <Copy size={14} />}</Button>
        </div>
      </Card>

      {onSkip && <Button variant="ghost" className="w-full" onClick={onSkip}>Skip for now</Button>}
    </div>
  )
}
