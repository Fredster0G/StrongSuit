import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  /** Renderer-side TitleBar.tsx uses this to decide whether to draw itself
   *  at all — mac keeps its native inset traffic lights, nothing to render. */
  platform: process.platform,
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximizeToggle: () => ipcRenderer.invoke('window-maximize-toggle'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  showAppMenu: () => ipcRenderer.invoke('show-app-menu'),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: unknown, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window-maximized-change', handler)
    return () => { ipcRenderer.removeListener('window-maximized-change', handler) }
  },
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  startSyncServer: (port?: number) => ipcRenderer.invoke('start-sync-server', port),
  stopSyncServer: () => ipcRenderer.invoke('stop-sync-server'),
  onSyncRequest: (callback: (data: any) => void) => {
    ipcRenderer.on('sync-request', (_event, data) => callback(data))
  },
  // send, not invoke — main listens with ipcMain.on (invoke needs a handle()
  // counterpart and would throw; this exact mismatch silently broke the LAN
  // sync response path before S13).
  sendSyncResponse: (syncId: string, success: boolean, message?: string) => {
    ipcRenderer.send('sync-response', { syncId, success, message })
  },
  /** Native menu → router. The main process never touches the renderer's
   *  history directly; it just names a route and the app navigates itself.
   *  Returns an unsubscribe so a remount doesn't stack duplicate listeners. */
  onMenuNavigate: (callback: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => callback(path)
    ipcRenderer.on('menu-navigate', handler)
    return () => { ipcRenderer.removeListener('menu-navigate', handler) }
  },
})
