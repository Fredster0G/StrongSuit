import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FocusJointPicker, JOINTS, LandmarkSmoother, RepCounter, barPathPoint, frameAngles, replayHistory,
  type AngleSample, type JointName, type Lm, type Pt, type Rep,
} from '@/lib/pose'
import { OcclusionRepairer } from '@/lib/skeleton'
import type { PoseTracker } from './tracker'

/** Shared empty array so an unoccluded frame doesn't allocate a new one 60
 *  times a second and re-render the overlay for nothing. */
const EMPTY_REPAIRED: number[] = []

/** Analysis of one clip, live as it plays. */
export interface ClipAnalysis {
  pose: Lm[] | null
  angles: Partial<Record<JointName, number>>
  focusJoint: JointName | null
  reps: Rep[]
  barPath: Pt[]
  /** true after a sustained run of frames with no person detected at all —
   *  surfaced as a hint, never an auto-restart. */
  trackingStale: boolean
  /** Landmark indices reconstructed this frame because equipment was blocking
   *  them — drawn differently so an inferred joint never looks measured. */
  repairedJoints: number[]
  reset: () => void
}

/** Single-clip version of the coach app's `useClipTracking`. The coach's
 *  variant additionally supports running two of these at once to compare a
 *  client against a reference lift; self-review only ever has one clip, so
 *  that machinery is deliberately left out rather than carried over unused.
 *
 *  Everything else is kept: the reliability behaviours in here were each
 *  found the hard way in the coach app (see PROGRESS.md debts #30–37) and
 *  every one of them applies just as much on a phone —
 *   · thrown detection errors are distinguished from clean "no person" misses,
 *     and a run of them rebuilds the tracker instead of going silently blind;
 *   · landmark positions are smoothed, not just the derived angles;
 *   · angle samples are buffered and replayed once the focus joint is known,
 *     so the first rep of a set isn't dropped during calibration;
 *   · bar-path points are throttled, because pushing React state on every
 *     tracked frame measurably degrades playback. */
export function useClipTracking({ active, videoRef, clipUrl, showBarPath, trackerRef, onFatalError, onRecovered }: {
  active: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  clipUrl: string | undefined
  showBarPath: boolean
  trackerRef: React.RefObject<PoseTracker | null>
  onFatalError: (message: string) => void
  onRecovered?: () => void
}): ClipAnalysis {
  const [pose, setPose] = useState<Lm[] | null>(null)
  const [angles, setAngles] = useState<Partial<Record<JointName, number>>>({})
  const [focusJoint, setFocusJoint] = useState<JointName | null>(null)
  const [reps, setReps] = useState<Rep[]>([])
  const [barPath, setBarPath] = useState<Pt[]>([])
  const [trackingStale, setTrackingStale] = useState(false)
  const [repairedJoints, setRepairedJoints] = useState<number[]>(EMPTY_REPAIRED)

  const consecutiveNoPerson = useRef(0)
  const repCounter = useRef(new RepCounter())
  const jointPicker = useRef(new FocusJointPicker())
  const lastBarPathPushMs = useRef(-1000)
  const landmarkSmoother = useRef(new LandmarkSmoother())
  const occlusionRepairer = useRef(new OcclusionRepairer())
  const angleBufferRef = useRef<AngleSample[]>([])
  const hasReplayed = useRef(false)
  const consecutiveErrors = useRef(0)

  const reset = useCallback(() => {
    repCounter.current.reset()
    jointPicker.current = new FocusJointPicker()
    landmarkSmoother.current.reset()
    occlusionRepairer.current.reset()
    angleBufferRef.current = []
    hasReplayed.current = false
    consecutiveErrors.current = 0
    consecutiveNoPerson.current = 0
    lastBarPathPushMs.current = -1000
    setRepairedJoints(EMPTY_REPAIRED)
    setReps([])
    setFocusJoint(null)
    setPose(null)
    setAngles({})
    setBarPath([])
    setTrackingStale(false)
  }, [])

  // A new clip = a new movement: restart analysis.
  useEffect(() => { reset() }, [clipUrl, reset])
  useEffect(() => { setBarPath([]) }, [showBarPath])

  const activeRef = useRef(active)
  activeRef.current = active
  const onFatalErrorRef = useRef(onFatalError)
  onFatalErrorRef.current = onFatalError
  const onRecoveredRef = useRef(onRecovered)
  onRecoveredRef.current = onRecovered

  useEffect(() => {
    if (!active) return
    const v = videoRef.current
    if (!v) return
    let cancelled = false
    let handle = 0
    let process: (() => void) | null = null

    trackerRef.current?.resetTimeline()

    const onFrame = () => {
      if (cancelled || !activeRef.current) return
      const tracker = trackerRef.current
      if (!tracker) return
      const frame = tracker.detectFrame(v)
      if (cancelled) return

      if (frame.error) {
        consecutiveErrors.current++
        // A dozen thrown detection errors in a row (not "no person visible",
        // actual exceptions) means the tracker is wedged — rebuild it rather
        // than staying blind for the rest of the clip.
        if (consecutiveErrors.current >= 12) {
          consecutiveErrors.current = 0
          void (async () => {
            const { createPoseTracker } = await import('./tracker')
            trackerRef.current?.dispose()
            const fresh = createPoseTracker()
            trackerRef.current = fresh
            try {
              await fresh.init()
              fresh.resetTimeline()
              if (!cancelled) onRecoveredRef.current?.()
            } catch (e) {
              if (!cancelled) onFatalErrorRef.current(e instanceof Error ? e.message : 'Movement tracking stopped working. Try again in a moment.')
              return
            }
            schedule()
          })()
          return
        }
        schedule()
        return
      }
      consecutiveErrors.current = 0

      if (frame.landmarks) {
        consecutiveNoPerson.current = 0
        setTrackingStale(stale => (stale ? false : stale))

        // Smooth before anything downstream reads these — the skeleton
        // overlay, angle math and bar-path all use this same smoothed array.
        const smoothed = landmarkSmoother.current.smooth(frame.landmarks, frame.timestampMs)
        // Then repair occlusion: machines block knees and elbows, and a held
        // landmark reads as a rep that never went deep. Reconstructed joints
        // come back with visibility set to their confidence, so `frameAngles`'
        // existing gate drops anything the repairer won't stand behind.
        const repair = occlusionRepairer.current.repair(smoothed)
        const landmarks = repair.landmarks
        setRepairedJoints(repair.repaired.length ? repair.repaired : EMPTY_REPAIRED)
        const a = frameAngles(landmarks)
        setPose(landmarks)
        setAngles(a)
        jointPicker.current.push(a)
        const focus = jointPicker.current.best()
        setFocusJoint(focus)

        angleBufferRef.current.push({ tMs: frame.timestampMs, angles: a })
        if (angleBufferRef.current.length > 600) angleBufferRef.current.shift()

        if (focus && !hasReplayed.current) {
          // First frame where a focus joint exists — replay everything
          // buffered since tracking started so a rep completed during
          // calibration still gets counted.
          hasReplayed.current = true
          replayHistory(repCounter.current, angleBufferRef.current, focus)
          setReps([...repCounter.current.reps])
        } else if (focus && a[focus] != null) {
          // Tell the counter whether the WORKING joint was reconstructed this
          // frame, so each rep is graded on how well it was actually seen.
          const occluded = repair.repaired.some(i => JOINTS[focus].includes(i as never))
          const rep = repCounter.current.push(frame.timestampMs, a[focus]!, occluded)
          if (rep) setReps([...repCounter.current.reps])
        }

        if (showBarPath && frame.timestampMs - lastBarPathPushMs.current >= 50) {
          lastBarPathPushMs.current = frame.timestampMs
          const p = barPathPoint(landmarks)
          if (p) setBarPath(path => (path.length > 600 ? path.slice(-600) : path).concat(p))
        }
      } else {
        consecutiveNoPerson.current++
        if (consecutiveNoPerson.current === 60) setTrackingStale(true)
      }
      schedule()
    }

    const rvfc = (v as Partial<{ requestVideoFrameCallback: (cb: () => void) => number }>).requestVideoFrameCallback
    const schedule = () => {
      if (cancelled) return
      if (rvfc) {
        handle = rvfc.call(v, () => void onFrame())
      } else if (!process) {
        // Browsers without rVFC (older iOS Safari especially): fall back to
        // the playback events instead of a hot loop.
        process = () => void onFrame()
        v.addEventListener('timeupdate', process)
        v.addEventListener('seeked', process)
      }
    }
    void onFrame() // analyse the frame already on screen
    return () => {
      cancelled = true
      const cancel = (v as Partial<{ cancelVideoFrameCallback: (h: number) => void }>).cancelVideoFrameCallback
      if (handle && cancel) cancel.call(v, handle)
      if (process) {
        v.removeEventListener('timeupdate', process)
        v.removeEventListener('seeked', process)
      }
    }
  }, [active, videoRef, clipUrl, showBarPath, trackerRef])

  return { pose, angles, focusJoint, reps, barPath, trackingStale, repairedJoints, reset }
}
