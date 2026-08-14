import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// Window size/position persistence (T11, debt #25). Stored as a small JSON
// file in userData rather than in the app's IndexedDB: the window has to be
// created before the renderer exists, so the renderer's database can't be the
// source of truth for it.

const DEFAULTS = { width: 1280, height: 800 }
/** Below this the sidebar + content stop being usable at all. */
const MIN_SIZE = { width: 900, height: 600 }

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

function stateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function isVisibleOnSomeDisplay(bounds: Rectangle): boolean {
  // A saved position can point at a monitor that is no longer attached (an
  // undocked laptop is the common case). Restoring it would open the window
  // off-screen, where it looks like the app failed to launch. Require a
  // meaningful overlap with a real display before trusting the position.
  return screen.getAllDisplays().some(display => {
    const area = display.workArea
    const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    return overlapX > 100 && overlapY > 50
  })
}

/** Bounds to open with. Falls back to the default centred window whenever the
 *  saved state is missing, unreadable, or points somewhere no longer visible. */
export function loadWindowState(): WindowState {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf-8')) as Partial<WindowState>
    const width = Math.max(MIN_SIZE.width, Number(raw.width) || DEFAULTS.width)
    const height = Math.max(MIN_SIZE.height, Number(raw.height) || DEFAULTS.height)
    const state: WindowState = { width, height, maximized: !!raw.maximized }
    if (typeof raw.x === 'number' && typeof raw.y === 'number'
      && isVisibleOnSomeDisplay({ x: raw.x, y: raw.y, width, height })) {
      state.x = raw.x
      state.y = raw.y
    }
    return state
  } catch {
    // No file yet on first launch, or a corrupt one — neither is worth
    // bothering the user about; just open at the default size.
    return { ...DEFAULTS, maximized: false }
  }
}

/** Persist this window's geometry as it changes. Writes are debounced because
 *  resize/move fire continuously while a window is being dragged. */
export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null

  const save = () => {
    if (win.isDestroyed()) return
    // getNormalBounds is the pre-maximize/pre-fullscreen geometry — saving the
    // maximized bounds instead would mean un-maximizing restored to a
    // full-screen-sized "restored" window.
    const bounds = win.getNormalBounds()
    const state: WindowState = {
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      maximized: win.isMaximized(),
    }
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(state))
    } catch {
      // A failed write must never break the app — worst case the next launch
      // opens at the default size.
    }
  }

  const scheduleSave = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 400)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  // 'close' fires before the window is gone, so the final geometry is still
  // readable here — after 'closed' it is not.
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    save()
  })
}

export { MIN_SIZE }
