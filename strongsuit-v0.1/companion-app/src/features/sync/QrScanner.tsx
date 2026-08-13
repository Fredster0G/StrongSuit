import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/design'

/** Camera QR scanner built on the platform's own BarcodeDetector — no
 *  decoding library shipped. Where BarcodeDetector doesn't exist (notably
 *  iOS Safari as of this writing), we say so and the paste path stays the
 *  fallback — never a silently-broken camera view. The stream is torn down
 *  the moment we have a result or the scanner closes: the camera is on for
 *  seconds, not sessions. */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike
  }
}

export function qrScanSupported(): boolean {
  return typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia
}

export function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    let raf = 0

    async function start() {
      if (!qrScanSupported()) {
        setError("This browser can't scan QR codes — paste the code instead.")
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, audio: false,
        })
      } catch {
        setError('Camera unavailable or permission declined — paste the code instead.')
        return
      }
      if (cancelled || !videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => {})

      const detector = new window.BarcodeDetector!({ formats: ['qr_code'] })
      const tick = async () => {
        if (cancelled || !videoRef.current) return
        if (videoRef.current.readyState >= 2) {
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length && codes[0].rawValue) {
              onScan(codes[0].rawValue)
              return // effect cleanup stops the stream
            }
          } catch { /* transient decode failure — keep scanning */ }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onScan])

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-xs font-semibold text-ink">Point at your coach's QR code</p>
        <button onClick={onClose} aria-label="Close scanner" className="-m-2 p-2"><X size={16} className="text-faint" /></button>
      </div>
      {error ? (
        <div className="px-3 py-6 text-center">
          <p className="text-xs text-muted">{error}</p>
          <Button variant="secondary" className="mt-3" onClick={onClose}>Back to paste</Button>
        </div>
      ) : (
        <video ref={videoRef} playsInline muted className="aspect-square w-full bg-black object-cover" />
      )}
    </div>
  )
}
