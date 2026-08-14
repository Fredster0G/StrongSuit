import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/** Present only inside the Electron desktop build (electron/preload.ts). */
interface MenuNavigationAPI {
  onMenuNavigate?: (cb: (path: string) => void) => () => void
}

/** Lets the native menu bar drive the router (T11). A no-op in the browser
 *  build, where `window.electronAPI` doesn't exist at all — so this can be
 *  called unconditionally from the Shell without a platform check at the
 *  call site. */
export function useMenuNavigation(): void {
  const navigate = useNavigate()

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: MenuNavigationAPI }).electronAPI
    // Older packaged builds have an `electronAPI` without this method; the
    // optional call keeps the desktop app working across a version mismatch
    // between a stale preload and a fresh renderer.
    return api?.onMenuNavigate?.(path => navigate(path))
  }, [navigate])
}
