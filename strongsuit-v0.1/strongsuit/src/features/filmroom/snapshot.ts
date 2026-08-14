// ===== Film Room PNG snapshot (T6b) =====
// Composites the current video frame with the tracked skeleton and bar path
// into a downloadable still — the thing a coach actually sends a client
// ("look at your knee here"), and the one export Film Room was missing.
//
// The skeleton is REDRAWN with the canvas 2D API rather than serialising the
// on-screen SVG overlay. That overlay colours its bones with Tailwind classes
// (`stroke-verde-600` → a CSS custom property), and a serialised standalone
// SVG carries no stylesheet, so it would rasterise with every stroke missing.
// Redrawing from the same landmark array the overlay uses keeps the output
// honest and needs no style plumbing.

import { BONES, type Lm, type Pt } from '@/lib/pose'

/** Matches the on-screen overlay's visibility gate so the snapshot shows
 *  exactly the joints the coach was looking at. */
const MIN_VISIBILITY = 0.5

export interface SnapshotOptions {
  landmarks?: Lm[] | null
  barPath?: Pt[]
  /** Burned into the corner so a saved still is still identifiable later. */
  caption?: string
  boneColor?: string
  jointColor?: string
  barPathColor?: string
}

/** Draw a frame + overlay to a canvas at the video's native resolution.
 *  Returns null when the video has no decoded frame yet. */
export function renderSnapshot(video: HTMLVideoElement, opts: SnapshotOptions = {}): HTMLCanvasElement | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, w, h)

  // Landmarks are normalised 0–1 against the video's own frame, so they map
  // straight onto the canvas without the letterbox offset the on-screen
  // overlay needs (there, the video element is usually larger than the frame).
  const { landmarks, barPath } = opts
  const bone = opts.boneColor ?? '#1E8A6E'
  const joint = opts.jointColor ?? '#1E8A6E'
  const barColor = opts.barPathColor ?? '#E2703A'
  // Scale line weights with resolution so a 1080p export doesn't get
  // hairline strokes that vanish when the image is viewed scaled down.
  const scale = Math.max(1, Math.min(w, h) / 480)

  if (barPath && barPath.length > 1) {
    ctx.strokeStyle = barColor
    ctx.lineWidth = 2.5 * scale
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    barPath.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)))
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  if (landmarks) {
    const visible = (i: number) => {
      const lm = landmarks[i]
      return lm && (lm.visibility ?? 1) >= MIN_VISIBILITY ? lm : null
    }
    ctx.strokeStyle = bone
    ctx.lineWidth = 2.5 * scale
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.9
    for (const [a, b] of BONES) {
      const p1 = visible(a), p2 = visible(b)
      if (!p1 || !p2) continue
      ctx.beginPath()
      ctx.moveTo(p1.x * w, p1.y * h)
      ctx.lineTo(p2.x * w, p2.y * h)
      ctx.stroke()
    }
    ctx.fillStyle = joint
    landmarks.forEach((lm, i) => {
      if (i < 11 || (lm.visibility ?? 1) < MIN_VISIBILITY) return // skip face points
      ctx.beginPath()
      ctx.arc(lm.x * w, lm.y * h, 3.5 * scale, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1
  }

  if (opts.caption) {
    const fontSize = Math.round(13 * scale)
    ctx.font = `${fontSize}px system-ui, sans-serif`
    const metrics = ctx.measureText(opts.caption)
    const padding = 6 * scale
    const boxH = fontSize + padding * 2
    ctx.fillStyle = 'rgba(23, 26, 30, 0.72)'
    ctx.fillRect(0, h - boxH, metrics.width + padding * 2, boxH)
    ctx.fillStyle = '#F7F6F3'
    ctx.fillText(opts.caption, padding, h - padding - fontSize * 0.15)
  }

  return canvas
}

/** Render and save a PNG. Resolves false when there's no frame to capture. */
export async function downloadSnapshot(
  video: HTMLVideoElement, filename: string, opts: SnapshotOptions = {},
): Promise<boolean> {
  const canvas = renderSnapshot(video, opts)
  if (!canvas) return false
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return false

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoking immediately can cancel the download in some browsers; one turn
  // of the event loop is enough for the click to be picked up.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
