// ===== On-device pose tracker (Film Room) =====
// Wraps MediaPipe PoseLandmarker (Apache-2.0). Everything is bundled locally:
// wasm runtime + model live in public/mediapipe/ — zero network at runtime,
// zero API keys. The lite model (~5.5MB) is chosen deliberately so tracking
// stays usable on low-tier laptops; the wasm runtime auto-falls back to a
// no-SIMD build on old CPUs, and we run detection only on video frames the
// browser actually presents (requestVideoFrameCallback), never a hot loop.
//
// This module is imported dynamically from FilmRoomPage so the main app
// bundle doesn't carry MediaPipe until a trainer turns tracking on.

import type { Lm } from '@/lib/pose'

export interface PoseFrame {
  landmarks: Lm[] | null
  timestampMs: number
}

type Landmarker = {
  detectForVideo: (v: HTMLVideoElement, ts: number) => { landmarks: Lm[][] }
  close: () => void
}

let landmarker: Landmarker | null = null
let initPromise: Promise<Landmarker> | null = null

/** Idempotent, lazy init. Throws a designed error message on failure. */
export async function initTracker(): Promise<Landmarker> {
  if (landmarker) return landmarker
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const vision = await import('@mediapipe/tasks-vision')
      const fileset = await vision.FilesetResolver.forVisionTasks('mediapipe')
      const lm = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'mediapipe/pose_landmarker_lite.task',
          // GPU when available; MediaPipe falls back to CPU automatically.
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
      landmarker = lm as unknown as Landmarker
      return landmarker
    } catch (err) {
      initPromise = null
      throw new Error(
        "Couldn't start movement tracking — the tracking model files are missing from this build. Reinstall Coachwright, then try again.",
        { cause: err },
      )
    }
  })()
  return initPromise
}

let lastTs = -1

/** Detect the pose on the video's current frame. MediaPipe requires strictly
 *  increasing timestamps in VIDEO mode, so we guard scrubbing backwards. */
export function detectFrame(video: HTMLVideoElement): PoseFrame {
  const ts = Math.round(video.currentTime * 1000)
  const empty = { landmarks: null, timestampMs: ts }
  if (!landmarker || video.readyState < 2) return empty
  const safeTs = ts <= lastTs ? lastTs + 1 : ts
  lastTs = safeTs
  try {
    const res = landmarker.detectForVideo(video, safeTs)
    return { landmarks: res.landmarks?.[0] ?? null, timestampMs: ts }
  } catch {
    return empty
  }
}

export function resetTrackerTimeline() {
  lastTs = -1
}

export function disposeTracker() {
  landmarker?.close()
  landmarker = null
  initPromise = null
  lastTs = -1
}
