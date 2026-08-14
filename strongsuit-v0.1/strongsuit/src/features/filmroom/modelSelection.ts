// ===== Which pose model a fresh tracker should actually load =====
//
// `lib/modelFetch.ts` can now download the upgraded MediaPipe pose models
// (`pose-full`, `pose-heavy`) into `modelBlobsRepo` — this is the piece that
// decides, at the moment a tracker actually starts, whether one of those is
// sitting in the cache and should be used instead of the bundled lite model.
//
// Best-available, not user-picked: `pose-heavy` (most accurate) wins over
// `pose-full` if both happen to be cached, matching the registry's own
// framing of these as an upgrade ladder, not independent alternatives — a
// coach who downloaded the heavier model wants it used, not asked to also
// flip a separate "which one" switch.

import { modelBlobsRepo } from '@/db/repo'

export type PoseModelId = 'pose-lite' | 'pose-full' | 'pose-heavy'

/** Path to the model bundled in every install — always available, never
 *  downloaded, the floor everything else is a voluntary upgrade over. */
export const BUNDLED_LITE_PATH = 'mediapipe/pose_landmarker_lite.task'

/** Best-first: `pose-heavy` before `pose-full` before the bundled default. */
const UPGRADE_PRIORITY: PoseModelId[] = ['pose-heavy', 'pose-full']

export interface ResolvedPoseModel {
  modelId: PoseModelId
  assetPath: string
  /** Only set for a cached upgrade — an `URL.createObjectURL` result the
   *  caller owns and must revoke exactly once (tracker.ts does this on
   *  dispose, or immediately if the model fails to load). The bundled path
   *  is a plain static asset URL and has nothing to revoke. */
  objectUrl?: string
}

/** What a fresh tracker should try to load right now. Re-resolved on every
 *  `init()` rather than cached at module scope, since a model can be
 *  downloaded or removed (Settings → On-device AI) between Film Room
 *  sessions — a stale answer here would mean a coach who just finished a
 *  9 MB download still gets the lite model until an app restart. */
export async function resolvePoseModel(): Promise<ResolvedPoseModel> {
  for (const modelId of UPGRADE_PRIORITY) {
    const row = await modelBlobsRepo.get(modelId)
    if (row) {
      const objectUrl = URL.createObjectURL(row.blob)
      return { modelId, assetPath: objectUrl, objectUrl }
    }
  }
  return { modelId: 'pose-lite', assetPath: BUNDLED_LITE_PATH }
}
