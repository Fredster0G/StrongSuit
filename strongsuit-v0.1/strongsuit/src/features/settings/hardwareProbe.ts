// ===== First-run system check: the actual probe (plan 02 §4) =====
//
// Separated from `lib/localAi.ts` on purpose: everything here touches
// `navigator`, WebGPU and Electron, so none of it is unit-testable, while the
// decisions it feeds ARE — the pure module takes a `HardwareProfile` and never
// asks where it came from.
//
// THE RULE THIS FILE FOLLOWS: report `null` for anything it cannot genuinely
// measure. A browser cannot read total system RAM — `navigator.deviceMemory`
// is Chrome-only, capped at 8 GB and rounded to a power of two, so a 64 GB
// workstation and a 9 GB laptop both report "8". Passing that off as a
// measurement would put a confident wrong recommendation in front of the
// user, which is worse than admitting we don't know and offering the small
// always-on model. The desktop build can read it properly, and says so.

import type { HardwareProfile } from '@/lib/localAi'

/** Electron's preload surface, when running inside the desktop app. */
interface DesktopApi {
  systemInfo?: () => Promise<{ totalMemGb?: number; cores?: number; freeDiskGb?: number }>
}

function desktopApi(): DesktopApi | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { electronAPI?: DesktopApi }).electronAPI ?? null
}

/** WebGPU adapter probe, falling back to WebGL2. Never throws — a probe that
 *  crashes the settings page is worse than one that reports "no GPU". */
async function probeGpu(): Promise<{ hasGpu: boolean; vramGb: number | null }> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    if (gpu) {
      const adapter = await gpu.requestAdapter()
      if (adapter) {
        // `maxBufferSize` is the closest thing WebGPU exposes to VRAM, and
        // it's a limit rather than a measurement — treated as a floor hint,
        // never reported to the user as "you have N GB of VRAM".
        const limits = (adapter as { limits?: { maxBufferSize?: number } }).limits
        const bytes = limits?.maxBufferSize
        return { hasGpu: true, vramGb: bytes ? Math.round(bytes / 1024 ** 3) : null }
      }
    }
  } catch { /* fall through to WebGL2 */ }

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    return { hasGpu: !!gl, vramGb: null }
  } catch {
    return { hasGpu: false, vramGb: null }
  }
}

/** Does this runtime have wasm SIMD? Without it, wasm inference is not
 *  viable at all, so it gates whether the light tier is even worth offering.
 *  Detected by compiling a tiny module that uses a SIMD opcode. */
function probeWasmSimd(): boolean {
  try {
    // Minimal module containing `v128.const` — invalid without SIMD support.
    return WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
      10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]))
  } catch {
    return false
  }
}

/** Free disk, when the platform will say. `navigator.storage.estimate()`
 *  reports the ORIGIN QUOTA rather than the disk, which is usually a
 *  fraction of it — useful as a floor, so it's only used to refuse a
 *  download that obviously won't fit. */
async function probeFreeDiskGb(): Promise<number | null> {
  const desktop = desktopApi()
  if (desktop?.systemInfo) {
    try {
      const info = await desktop.systemInfo()
      if (info.freeDiskGb != null) return info.freeDiskGb
    } catch { /* fall through */ }
  }
  try {
    const est = await navigator.storage?.estimate?.()
    if (est?.quota != null) return est.quota / 1024 ** 3
  } catch { /* unknown */ }
  return null
}

/**
 * Measure this machine.
 *
 * Re-runnable, and meant to be: people upgrade laptops and a studio buys new
 * hardware, so a one-off check at install would go stale silently.
 */
export async function probeHardware(): Promise<HardwareProfile> {
  const [{ hasGpu, vramGb }, freeDiskGb] = await Promise.all([probeGpu(), probeFreeDiskGb()])

  let ramGb: number | null = null
  let cores: number | null = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || null : null

  const desktop = desktopApi()
  if (desktop?.systemInfo) {
    try {
      const info = await desktop.systemInfo()
      // Only the desktop build gets to claim a RAM figure, because only it
      // has a real one. See the file header.
      if (info.totalMemGb != null) ramGb = Math.round(info.totalMemGb)
      if (info.cores != null) cores = info.cores
    } catch { /* stays null — honest */ }
  }

  return { ramGb, cores, hasGpu, vramGb, hasWasmSimd: probeWasmSimd(), freeDiskGb }
}
