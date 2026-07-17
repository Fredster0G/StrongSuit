import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  startSyncServer: (port?: number) => ipcRenderer.invoke('start-sync-server', port),
  stopSyncServer: () => ipcRenderer.invoke('stop-sync-server'),
  onSyncRequest: (callback: (data: any) => void) => {
    ipcRenderer.on('sync-request', (_event, data) => callback(data))
  },
  sendSyncResponse: (syncId: string, success: boolean, message?: string) => {
    ipcRenderer.invoke('sync-response', { syncId, success, message })
  }
})
