import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Clapperboard, Play, Pause, ChevronLeft, ChevronRight, Activity, Loader2,
  Link2, Link2Off, Ruler, Slash, Eraser, Upload, Layers, Columns2, FlipHorizontal2,
} from 'lucide-react'
import { Button, Card, SectionHeader, EmptyState, Kbd, Select, Stat, toastError } from '@/design'
import {
  frameAngles, symmetryPct, BONES, RepCounter, FocusJointPicker,
  SYMMETRY_PAIRS, repConsistency, barPathDeviation, barPathPoint,
  type JointName, type Lm, type Rep,
} from '@/lib/pose'

// ===== Film Room — local biomechanical video analysis =====
// Everything stays on-device: videos load via object URLs and are never
// persisted. Compare a client's lift against a reference (or their own
// earlier footage) side-by-side or overlaid, step frame-by-frame, lock the
// two clips in sync, and measure joint angles directly on the footage.

type Pt = { x: number; y: number } // percent coords (0..1) of the stage
type Shape =
  | { kind: 'line'; pts: [Pt, Pt] }
  | { kind: 'angle'; pts: [Pt, Pt, Pt] }
type Tool = 'off' | 'line' | 'angle'

interface Clip { url: string; name: string }

function fmtTime(t: number) {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}

/** Angle at vertex p2 (degrees), computed in pixel space to respect aspect. */
function angleAt(pts: [Pt, Pt, Pt], w: number, h: number) {
  const [a, b, c] = pts.map(p => ({ x: p.x * w, y: p.y * h }))
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const m1 = Math.hypot(v1.x, v1.y)
  const m2 = Math.hypot(v2.x, v2.y)
  if (!m1 || !m2) return 0
  return Math.round((Math.acos(Math.min(1, Math.max(-1, dot / (m1 * m2)))) * 180) / Math.PI)
}

/** Maps normalized pose landmarks onto the letterboxed video content box and
 *  draws the skeleton. Reads the <video> element's live geometry each render
 *  (the page re-renders per tracked frame anyway). */
function SkeletonOverlay({ landmarks, videoRef, barPath }: {
  landmarks: Lm[] | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  barPath?: Pt[]
}) {
  const v = videoRef.current
  if (!v || !v.videoWidth) return null
  const cw = v.clientWidth, ch = v.clientHeight
  const scale = Math.min(cw / v.videoWidth, ch / v.videoHeight)
  const dw = v.videoWidth * scale, dh = v.videoHeight * scale
  const ox = (cw - dw) / 2, oy = (ch - dh) / 2
  const pt = (i: number) => {
    const lm = landmarks?.[i]
    if (!lm || (lm.visibility ?? 1) < 0.5) return null
    return { x: ox + lm.x * dw, y: oy + lm.y * dh }
  }
  return (
    <svg width="100%" height="100%" className="pointer-events-none absolute inset-0">
      {barPath && barPath.length > 1 && (
        <polyline
          points={barPath.map(p => `${ox + p.x * dw},${oy + p.y * dh}`).join(' ')}
          className="fill-none stroke-ember-500" strokeWidth={2} opacity={0.8}
        />
      )}
      {landmarks && BONES.map(([a, b], i) => {
        const p1 = pt(a), p2 = pt(b)
        if (!p1 || !p2) return null
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="stroke-verde-600" strokeWidth={2} opacity={0.85} />
      })}
      {landmarks && landmarks.map((lm, i) => {
        if (i < 11 || (lm.visibility ?? 1) < 0.5) return null // skip face points
        return <circle key={i} cx={ox + lm.x * dw} cy={oy + lm.y * dh} r={3} className="fill-verde-600" opacity={0.9} />
      })}
    </svg>
  )
}

function VideoPane({ label, clip, onPick, videoRef, onScrub, muted = true, overlay, footer, mirrored }: {
  label: string
  clip: Clip | null
  onPick: (file: File) => void
  videoRef: React.RefObject<HTMLVideoElement | null>
  onScrub?: (t: number) => void
  muted?: boolean
  overlay?: React.ReactNode
  footer?: React.ReactNode
  mirrored?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</span>
        {clip && (
          <button
            onClick={() => fileRef.current?.click()}
            className="text-2xs text-muted hover:text-ink"
          >
            Replace video
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
      {clip ? (
        <div className="relative overflow-hidden rounded-card border border-line bg-iron-950">
          <video
            ref={videoRef}
            src={clip.url}
            muted={muted}
            playsInline
            className={`max-h-[420px] w-full object-contain ${mirrored ? '-scale-x-100' : ''}`}
            onSeeked={e => onScrub?.((e.target as HTMLVideoElement).currentTime)}
          />
          {overlay}
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex h-56 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line text-muted hover:border-verde-600 hover:text-ink"
        >
          <Upload size={20} strokeWidth={1.5} />
          <span className="text-sm font-medium">Load {label.toLowerCase()}</span>
          <span className="text-2xs text-faint">Stays on this device — never uploaded</span>
        </button>
      )}
      {clip && footer}
      {clip && <p className="truncate text-2xs text-faint" title={clip.name}>{clip.name}</p>}
    </div>
  )
}

/** Per-video transport state + controls. Binds to whatever <video> the ref
 *  currently points at; re-binds when the clip (src) changes. */
function useClip(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  clipKey: string | undefined,
  fps: number,
) {
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => setTime(v.currentTime)
    const onMeta = () => setDur(v.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('seeked', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    setTime(v.currentTime); if (v.duration) setDur(v.duration); setPlaying(!v.paused)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('seeked', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [videoRef, clipKey])
  const toggle = useCallback(() => {
    const v = videoRef.current; if (!v) return
    if (v.paused) void v.play(); else v.pause()
  }, [videoRef])
  const step = useCallback((frames: number) => {
    const v = videoRef.current; if (!v) return
    v.pause()
    v.currentTime = Math.min(Math.max(0, v.currentTime + frames / fps), v.duration || Infinity)
  }, [videoRef, fps])
  const seek = useCallback((t: number) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = t
  }, [videoRef])
  return { time, dur, playing, toggle, step, seek }
}

/** One transport row: play/pause, frame step, scrubber, time readout. */
function TransportBar({ label, time, dur, playing, fps, onToggle, onStep, onSeek, hints, accent }: {
  label?: string
  time: number
  dur: number
  playing: boolean
  fps: number
  onToggle: () => void
  onStep: (frames: number) => void
  onSeek: (t: number) => void
  hints?: boolean
  accent?: 'verde' | 'slate'
}) {
  return (
    <Card pad={false} className="flex items-center gap-2 px-3 py-2">
      {label && (
        <span className={`shrink-0 text-2xs font-semibold uppercase tracking-wide ${accent === 'slate' ? 'text-[var(--chart-3)]' : 'text-verde-600'}`}>
          {label}
        </span>
      )}
      <Button size="sm" variant="primary" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onStep(-1)} title="Back one frame" aria-label="Back one frame">
        <ChevronLeft size={14} />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onStep(1)} title="Forward one frame" aria-label="Forward one frame">
        <ChevronRight size={14} />
      </Button>
      <input
        type="range" min={0} max={dur || 0} step={1 / fps} value={time}
        onChange={e => onSeek(Number(e.target.value))}
        aria-label="Scrub"
        className="min-w-0 flex-1 accent-[var(--verde-600)]"
      />
      <span className="font-mono tnum text-xs text-muted">{fmtTime(time)} / {fmtTime(dur)}</span>
      {hints && (
        <span className="hidden items-center gap-1 text-2xs text-faint lg:flex">
          <Kbd>Space</Kbd><Kbd>←</Kbd><Kbd>→</Kbd>
        </span>
      )}
    </Card>
  )
}

export default function FilmRoomPage() {
  const videoA = useRef<HTMLVideoElement>(null)
  const videoB = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const [clipA, setClipA] = useState<Clip | null>(null)
  const [clipB, setClipB] = useState<Clip | null>(null)
  const [mode, setMode] = useState<'side' | 'overlay'>('side')
  const [opacity, setOpacity] = useState(0.5)
  const [fps, setFps] = useState(30)
  const [speed, setSpeed] = useState(1)
  const [syncOffset, setSyncOffset] = useState<number | null>(null) // B time − A time
  const [mirrorA, setMirrorA] = useState(false)
  const [mirrorB, setMirrorB] = useState(false)
  const [tool, setTool] = useState<Tool>('off')
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Pt[]>([])
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })

  // ---- movement tracking (on-device AI) ----
  const [tracking, setTracking] = useState<'off' | 'loading' | 'on'>('off')
  const trackingRef = useRef(tracking)
  trackingRef.current = tracking
  const [pose, setPose] = useState<Lm[] | null>(null)
  const [angles, setAngles] = useState<Partial<Record<JointName, number>>>({})
  const [focusJoint, setFocusJoint] = useState<JointName | null>(null)
  const [reps, setReps] = useState<Rep[]>([])
  const [barPath, setBarPath] = useState<Pt[]>([])
  const [showBarPath, setShowBarPath] = useState(false)
  const repCounter = useRef(new RepCounter())
  const jointPicker = useRef(new FocusJointPicker())

  const resetAnalysis = useCallback(() => {
    repCounter.current.reset()
    jointPicker.current = new FocusJointPicker()
    setReps([])
    setFocusJoint(null)
    setPose(null)
    setAngles({})
    setBarPath([])
  }, [])

  const toggleTracking = useCallback(async () => {
    if (tracking !== 'off') {
      setTracking('off')
      setPose(null)
      return
    }
    setTracking('loading')
    try {
      const { initTracker, resetTrackerTimeline } = await import('./tracker')
      await initTracker()
      resetTrackerTimeline()
      resetAnalysis()
      setTracking('on')
    } catch (e) {
      setTracking('off')
      toastError(e instanceof Error ? e.message : "Couldn't start movement tracking.")
    }
  }, [tracking, resetAnalysis])

  // Detection loop: rides the browser's presented-frame callback so we only
  // run the model when a new frame is actually shown (kind to weak hardware).
  useEffect(() => {
    if (tracking !== 'on') return
    const v = videoA.current
    if (!v) return
    let cancelled = false
    let handle = 0
    let process: (() => void) | null = null

    // Replacing the clip while tracking stays on (this effect re-runs on
    // clipA) resets the video's currentTime to ~0, but MediaPipe's VIDEO-mode
    // timestamp guard is monotonic and module-level — without this it would
    // keep rejecting the new clip's early frames as "in the past".
    import('./tracker').then(({ resetTrackerTimeline }) => { if (!cancelled) resetTrackerTimeline() })

    const onFrame = async () => {
      if (cancelled || trackingRef.current !== 'on') return
      const { detectFrame } = await import('./tracker')
      const frame = detectFrame(v)
      if (cancelled) return
      if (frame.landmarks) {
        const a = frameAngles(frame.landmarks)
        setPose(frame.landmarks)
        setAngles(a)
        jointPicker.current.push(a)
        const focus = jointPicker.current.best()
        setFocusJoint(focus)
        if (focus && a[focus] != null) {
          const rep = repCounter.current.push(frame.timestampMs, a[focus]!)
          if (rep) setReps([...repCounter.current.reps])
        }
        if (showBarPath) {
          const p = barPathPoint(frame.landmarks)
          if (p) setBarPath(path => (path.length > 600 ? path.slice(-600) : path).concat(p))
        }
      }
      schedule()
    }
    const rvfc = (v as Partial<{ requestVideoFrameCallback: (cb: () => void) => number }>).requestVideoFrameCallback
    const schedule = () => {
      if (cancelled) return
      if (rvfc) {
        handle = rvfc.call(v, () => void onFrame())
      } else if (!process) {
        // fallback for browsers without rVFC: poll on timeupdate/seeked
        process = () => void onFrame()
        v.addEventListener('timeupdate', process)
        v.addEventListener('seeked', process)
      }
    }
    void onFrame() // analyze the currently shown frame immediately
    return () => {
      cancelled = true
      const cancel = (v as Partial<{ cancelVideoFrameCallback: (h: number) => void }>).cancelVideoFrameCallback
      if (handle && cancel) cancel.call(v, handle)
      if (process) {
        v.removeEventListener('timeupdate', process)
        v.removeEventListener('seeked', process)
      }
    }
  }, [tracking, clipA, showBarPath])

  // new clip = new movement: restart the analysis state
  useEffect(() => { resetAnalysis() }, [clipA, resetAnalysis])

  const pick = (setter: (c: Clip) => void) => (file: File) => {
    setter({ url: URL.createObjectURL(file), name: file.name })
  }
  // revoke object URLs when clips are replaced or the page unmounts
  useEffect(() => () => { if (clipA) URL.revokeObjectURL(clipA.url) }, [clipA])
  useEffect(() => () => { if (clipB) URL.revokeObjectURL(clipB.url) }, [clipB])

  // per-video transport controllers (each drives its own <video>)
  const A = useClip(videoA, clipA?.url, fps)
  const B = useClip(videoB, clipB?.url, fps)

  // Two clips are "linked" when overlaid or sync-locked: one transport drives
  // both, holding B at A's time plus the locked offset (0 in overlay).
  const effectiveOffset = syncOffset !== null
    ? syncOffset
    : (mode === 'overlay' && clipA && clipB ? 0 : null)
  const linked = effectiveOffset !== null && !!clipB

  const alignB = useCallback(() => {
    const a = videoA.current, b = videoB.current
    if (a && b && effectiveOffset !== null) {
      b.currentTime = Math.max(0, a.currentTime + effectiveOffset)
    }
  }, [effectiveOffset])

  useEffect(() => {
    for (const v of [videoA.current, videoB.current]) if (v) v.playbackRate = speed
  }, [speed, clipA, clipB])

  // stage size for pixel-true angle math + label placement
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [clipA, mode])

  // master transport = drives A, and B too when the clips are linked
  const masterToggle = useCallback(() => {
    const a = videoA.current, b = videoB.current
    if (!a) return
    if (a.paused) {
      alignB()
      void a.play()
      if (b && linked) void b.play()
    } else {
      a.pause(); if (linked) b?.pause()
    }
  }, [alignB, linked])

  const masterStep = useCallback((frames: number) => {
    const a = videoA.current
    if (!a) return
    a.pause(); if (linked) videoB.current?.pause()
    a.currentTime = Math.min(Math.max(0, a.currentTime + frames / fps), a.duration || Infinity)
    alignB()
  }, [fps, alignB, linked])

  const masterSeek = useCallback((t: number) => {
    const a = videoA.current
    if (!a) return
    a.currentTime = t
    alignB()
  }, [alignB])

  const lockSync = () => {
    const a = videoA.current, b = videoB.current
    if (!a || !b) return
    setSyncOffset(b.currentTime - a.currentTime)
  }

  // keyboard: space play/pause, arrows step 1 frame (shift = 5)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return
      if (e.key === ' ') { e.preventDefault(); masterToggle() }
      if (e.key === 'ArrowRight') { e.preventDefault(); masterStep(e.shiftKey ? 5 : 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); masterStep(e.shiftKey ? -5 : -1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [masterToggle, masterStep])

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool === 'off') return
    const rect = e.currentTarget.getBoundingClientRect()
    const p: Pt = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
    const next = [...draft, p]
    const needed = tool === 'line' ? 2 : 3
    if (next.length === needed) {
      setShapes(s => [...s, { kind: tool, pts: next as [Pt, Pt] & [Pt, Pt, Pt] } as Shape])
      setDraft([])
    } else {
      setDraft(next)
    }
  }

  const { w, h } = stageSize
  const annotations = useMemo(() => (
    <svg width="100%" height="100%" className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      {shapes.map((s, i) => {
        const px = s.pts.map(p => ({ x: p.x * w, y: p.y * h }))
        if (s.kind === 'line') {
          return <line key={i} x1={px[0].x} y1={px[0].y} x2={px[1].x} y2={px[1].y} className="stroke-ember-500" strokeWidth={2} />
        }
        const deg = angleAt(s.pts, w, h)
        return (
          <g key={i}>
            <polyline
              points={px.map(p => `${p.x},${p.y}`).join(' ')}
              className="fill-none stroke-ember-500" strokeWidth={2}
            />
            {px.map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={3} className="fill-ember-500" />)}
            <text x={px[1].x + 8} y={px[1].y - 8} className="fill-ember-500 font-mono text-xs font-semibold">
              {deg}°
            </text>
          </g>
        )
      })}
      {draft.map((p, i) => <circle key={i} cx={p.x * w} cy={p.y * h} r={3} className="fill-verde-600" />)}
    </svg>
  ), [shapes, draft, w, h])

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader title="Film Room" />

      {!clipA && !clipB ? (
        <div className="space-y-4">
          <EmptyState
            icon={<Clapperboard size={32} strokeWidth={1.5} />}
            title="Coach the movement, frame by frame"
            body="Load a client's lift and a reference clip. Compare them side-by-side or overlaid, lock them in sync, step one frame at a time, and measure joint angles on the footage. Videos never leave this device."
          />
          <div className="flex gap-4">
            <VideoPane label="Client video" clip={clipA} onPick={pick(setClipA)} videoRef={videoA} />
            <VideoPane label="Reference video" clip={clipB} onPick={pick(setClipB)} videoRef={videoB} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <Card pad={false} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
            <div className="flex items-center gap-1">
              <Button size="sm" variant={mode === 'side' ? 'primary' : 'ghost'} onClick={() => setMode('side')}>
                <Columns2 size={14} /> Side by side
              </Button>
              <Button
                size="sm" variant={mode === 'overlay' ? 'primary' : 'ghost'}
                onClick={() => setMode('overlay')} disabled={!clipA || !clipB}
                title={!clipA || !clipB ? 'Load both videos to overlay' : undefined}
              >
                <Layers size={14} /> Overlay
              </Button>
            </div>

            {mode === 'overlay' && (
              <label className="flex items-center gap-2 text-xs text-muted">
                Blend
                <input
                  type="range" min={0} max={1} step={0.05} value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))}
                  className="w-24 accent-[var(--verde-600)]"
                />
              </label>
            )}

            <div className="flex items-center gap-1.5 text-xs text-muted">
              Speed
              <Select value={speed} onChange={e => setSpeed(Number(e.target.value))} className="!h-7 !w-20 text-xs">
                <option value={0.25}>0.25×</option>
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
              </Select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted">
              Frame rate
              <Select value={fps} onChange={e => setFps(Number(e.target.value))} className="!h-7 !w-24 text-xs">
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
                <option value={120}>120 fps</option>
              </Select>
            </div>

            {clipA && (
              <Button
                size="sm"
                variant={tracking === 'on' ? 'primary' : 'secondary'}
                onClick={toggleTracking}
                disabled={tracking === 'loading'}
                title="On-device movement tracking: skeleton, joint angles, reps, tempo, depth and symmetry. Runs entirely on this computer."
              >
                {tracking === 'loading'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Activity size={14} />}
                {tracking === 'on' ? 'Tracking on' : tracking === 'loading' ? 'Starting…' : 'Track movement'}
              </Button>
            )}

            {clipA && tracking === 'on' && (
              <Button
                size="sm" variant={showBarPath ? 'primary' : 'secondary'}
                onClick={() => { setShowBarPath(s => !s); setBarPath([]) }}
                title="Trace the wrist/bar path across the lift and measure horizontal drift from vertical."
              >
                Bar path
              </Button>
            )}

            {clipA && clipB && (
              syncOffset === null ? (
                <Button size="sm" variant="secondary" onClick={lockSync} title="Scrub both clips to the same moment (e.g. the start of the descent), then lock them together.">
                  <Link2 size={14} /> Lock sync here
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setSyncOffset(null)}>
                  <Link2Off size={14} /> Unlock sync
                </Button>
              )
            )}

            {clipA && (
              <Button size="sm" variant={mirrorA ? 'primary' : 'ghost'} onClick={() => setMirrorA(m => !m)} title="Flip the client video horizontally — useful when the two clips are filmed from opposite sides">
                <FlipHorizontal2 size={14} /> Flip client
              </Button>
            )}
            {clipB && (
              <Button size="sm" variant={mirrorB ? 'primary' : 'ghost'} onClick={() => setMirrorB(m => !m)} title="Flip the reference video horizontally">
                <FlipHorizontal2 size={14} /> Flip ref
              </Button>
            )}

            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant={tool === 'line' ? 'primary' : 'ghost'} onClick={() => { setTool(tool === 'line' ? 'off' : 'line'); setDraft([]) }} title="Draw a line: click two points (bar path, back angle)">
                <Slash size={14} /> Line
              </Button>
              <Button size="sm" variant={tool === 'angle' ? 'primary' : 'ghost'} onClick={() => { setTool(tool === 'angle' ? 'off' : 'angle'); setDraft([]) }} title="Measure an angle: click three points — the middle click is the joint">
                <Ruler size={14} /> Angle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShapes([]); setDraft([]) }} disabled={!shapes.length && !draft.length}>
                <Eraser size={14} /> Clear
              </Button>
            </div>
          </Card>

          {/* Stage — videos only; annotations overlay this, transports sit below */}
          <div
            ref={stageRef}
            onClick={onStageClick}
            className={`relative ${tool !== 'off' ? 'cursor-crosshair' : ''}`}
          >
            {mode === 'side' ? (
              <div className="flex flex-col gap-4 lg:flex-row">
                <VideoPane
                  label="Client video" clip={clipA} onPick={pick(setClipA)} videoRef={videoA}
                  mirrored={mirrorA}
                  overlay={tracking === 'on' ? <SkeletonOverlay landmarks={pose} videoRef={videoA} barPath={showBarPath ? barPath : undefined} /> : null}
                />
                <VideoPane
                  label="Reference video" clip={clipB} onPick={pick(setClipB)} videoRef={videoB}
                  mirrored={mirrorB}
                />
              </div>
            ) : (
              <div className="overflow-hidden rounded-card border border-line bg-iron-950">
                <div className="relative">
                  <video ref={videoA} src={clipA?.url} muted playsInline className={`max-h-[520px] w-full object-contain ${mirrorA ? '-scale-x-100' : ''}`} />
                  <video
                    ref={videoB} src={clipB?.url} muted playsInline
                    style={{ opacity }}
                    className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${mirrorB ? '-scale-x-100' : ''}`}
                  />
                  {tracking === 'on' && <SkeletonOverlay landmarks={pose} videoRef={videoA} barPath={showBarPath ? barPath : undefined} />}
                </div>
              </div>
            )}
            {annotations}
          </div>

          {/* Transport — one bar per video, or a single master bar when linked */}
          {(clipA || clipB) && (
            <div className="space-y-2">
              {clipA && (
                <TransportBar
                  label={linked ? 'Both — synced' : (clipB ? 'Client' : undefined)} hints
                  time={A.time} dur={A.dur} playing={A.playing} fps={fps}
                  onToggle={masterToggle} onStep={masterStep} onSeek={masterSeek}
                />
              )}
              {clipB && !linked && (
                <TransportBar
                  label={clipA ? 'Reference' : undefined} accent="slate"
                  time={B.time} dur={B.dur} playing={B.playing} fps={fps}
                  onToggle={B.toggle} onStep={B.step} onSeek={B.seek}
                />
              )}
              {clipA && clipB && linked && (
                <p className="flex items-center gap-1.5 px-1 text-2xs text-faint">
                  <Link2 size={12} className="text-verde-600" /> Reference is locked to the client video — the bar above scrubs both. Unlock sync to control them separately.
                </p>
              )}
            </div>
          )}

          {tool === 'angle' && (
            <p className="text-xs text-muted">
              Click three points — first limb end, then the joint, then the other limb end. The angle reads at the joint.
            </p>
          )}

          {/* Movement analysis readout */}
          {tracking === 'on' && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600">
                  <Activity size={14} /> Movement analysis
                  {focusJoint && <span className="font-normal normal-case text-faint">· working joint: {focusJoint}</span>}
                </div>
                <span className="text-2xs text-faint">Runs on this device — nothing is uploaded</span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Reps detected" value={reps.length} />
                <Stat
                  label="Last rep tempo"
                  value={reps.length
                    ? `${(reps.at(-1)!.eccentricMs / 1000).toFixed(1)}↓ ${(reps.at(-1)!.concentricMs / 1000).toFixed(1)}↑`
                    : '—'}
                  unit={reps.length ? 's' : undefined}
                />
                <Stat
                  label="Depth (last rep)"
                  value={reps.length ? reps.at(-1)!.depth : '—'}
                  unit={reps.length ? '%' : undefined}
                  tone={reps.length && reps.at(-1)!.depth >= 100 ? 'verde' : 'ink'}
                />
                <Stat
                  label="Symmetry"
                  value={(() => {
                    const scores = SYMMETRY_PAIRS
                      .map(([l, r]) => symmetryPct(angles[l], angles[r]))
                      .filter((s): s is number => s !== null)
                    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—'
                  })()}
                  unit="%"
                />
              </div>
              {reps.length >= 2 && (() => {
                const consistency = repConsistency(reps)
                return (
                  <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3 sm:grid-cols-4">
                    <Stat
                      label="Depth consistency" unit={consistency.depth ? '%' : undefined}
                      value={consistency.depth?.score ?? '—'}
                      tone={consistency.depth && consistency.depth.score < 70 ? 'ember' : 'ink'}
                    />
                    <Stat
                      label="Tempo consistency" unit={consistency.tempo ? '%' : undefined}
                      value={consistency.tempo?.score ?? '—'}
                      tone={consistency.tempo && consistency.tempo.score < 70 ? 'ember' : 'ink'}
                    />
                    {showBarPath && barPath.length > 5 && (
                      <Stat
                        label="Bar path drift" value={barPathDeviation(barPath).driftPct} unit="%"
                        tone={barPathDeviation(barPath).driftPct > 15 ? 'ember' : 'verde'}
                      />
                    )}
                  </div>
                )
              })()}
              {Object.keys(angles).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
                  {(Object.entries(angles) as [JointName, number][]).map(([name, a]) => (
                    <span key={name} className={`text-2xs ${name === focusJoint ? 'text-ink font-medium' : 'text-faint'}`}>
                      {name} <span className="font-mono tnum">{a}°</span>
                    </span>
                  ))}
                </div>
              )}
              {reps.length === 0 && (
                <p className="mt-3 text-xs text-muted">
                  Play the clip through a few reps — the counter calibrates from the movement itself, picks the working joint automatically, and starts scoring depth and tempo.
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
