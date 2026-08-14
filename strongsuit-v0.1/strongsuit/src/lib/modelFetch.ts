// ===== Local AI: the actual weight fetcher =====
//
// `lib/localAi.ts` is the honest capability report — what a model costs and
// whether this machine/licence may have it. `settings/LocalAiCard.tsx` used
// to stop there on purpose ("the manager is real, the fetcher isn't yet").
// This file is that missing piece: download a model's bytes, with real
// progress, into `modelBlobsRepo` (IndexedDB), so it survives a restart and
// never needs re-fetching.
//
// Still true, unchanged: nothing here is load-bearing. A model that fails to
// download, or is never downloaded at all, leaves every engine in the app
// working exactly as before — this only ever ADDS a capability, never gates
// one away.
//
// Scope, stated plainly: this fetches and caches bytes. It does not run
// inference. `ModelSpec.url` is only populated (see localAi.ts) for entries
// this app can actually consume once cached — today, that's exactly the two
// upgraded MediaPipe pose models (`pose-full`, `pose-heavy`): Film Room's
// existing @mediapipe/tasks-vision runtime can load any pose_landmarker
// *.task file, it just hard-codes the bundled lite one right now, so wiring
// a downloaded one in is a real, near-term follow-up, not speculative.
// Everything else in the registry needs an inference runtime this app
// doesn't depend on yet (tesseract.js for OCR, transformers.js or
// onnxruntime-web for embeddings/whisper/the assistant) — fetching bytes
// nothing can load would be storage spent for nothing, so those stay
// without a `url` until that runtime is actually added.

import { modelBlobsRepo } from '@/db/repo'
import type { ModelSpec } from './localAi'

export interface DownloadProgress {
  loaded: number
  /** 0 when the server didn't send Content-Length — the UI shows an
   *  indeterminate state rather than a bogus percentage. */
  total: number
}

/** Human-readable byte count — "9.0 MB", "1.2 GB". Pure, so it's testable
 *  without a DOM or a real download. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`
}

/** A download that completed but landed suspiciously short of what the
 *  registry expects — most likely an intercepted request (captive wifi
 *  portal, a proxy's error page) that still answered 200. Real network
 *  variance (a slightly stale size figure) is well inside this tolerance;
 *  an HTML error page standing in for a 9 MB model file is not. */
export function isSuspiciouslyShort(actualBytes: number, expectedMb: number): boolean {
  const expectedBytes = expectedMb * 1024 * 1024
  return actualBytes < expectedBytes * 0.5
}

/**
 * Fetch a URL with real progress, by reading the response body stream
 * chunk-by-chunk rather than waiting for the whole thing — `fetch` itself
 * has no progress event, this is the only way to get one without a
 * dependency. Cancellable via `signal`, same as any other fetch.
 */
export async function fetchWithProgress(
  url: string,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Download failed — the server said ${res.status}.`)
  if (!res.body) {
    // Environments without streaming fetch (rare, but real) — fall back to
    // an all-at-once download with no progress rather than failing outright.
    onProgress({ loaded: 0, total: 0 })
    return res.blob()
  }

  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    // Copies into a fresh, real ArrayBuffer — `value`'s own buffer is typed
    // ArrayBufferLike (it could in principle be a SharedArrayBuffer), which
    // Blob's constructor rejects even though every real fetch stream hands
    // back a plain ArrayBuffer. Same reasoning as lib/licence.ts's own
    // b64urlToBytes.
    chunks.push(new Uint8Array(value))
    loaded += value.byteLength
    onProgress({ loaded, total })
  }

  return new Blob(chunks)
}

/**
 * Download one model and cache it, or throw with a message fit to show the
 * user directly. Idempotent to call again after a failure — nothing is
 * written to the cache until the whole download (and the size sanity check)
 * succeeds, so a failed attempt never leaves a corrupt/partial entry that
 * `modelBlobsRepo.has()` would mistake for "installed".
 */
export async function downloadAndCacheModel(
  model: ModelSpec,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!model.url) {
    throw new Error(`${model.label} isn't available to download yet — it needs an on-device runtime this build doesn't include.`)
  }
  const blob = await fetchWithProgress(model.url, onProgress, signal)
  if (isSuspiciouslyShort(blob.size, model.sizeMb)) {
    throw new Error(
      `That download finished at ${formatBytes(blob.size)}, far short of the ~${model.sizeMb} MB expected. ` +
      `It likely got intercepted (captive wifi, a proxy) rather than actually failing — try again on a direct connection.`,
    )
  }
  await modelBlobsRepo.put(model.id, blob)
}
