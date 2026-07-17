import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Wifi, X, Loader2 } from 'lucide-react'
import { Dialog, Button, toast } from '@/design'
import { buildPacket, applyPacket } from './syncApi'
import { devicesRepo } from '@/db/repo'

/** Present only inside the Electron desktop build (see electron/preload.ts). */
interface ElectronSyncAPI {
  getLocalIp: () => Promise<string>
  startSyncServer: (port?: number) => Promise<{ success: boolean; port?: number; message?: string }>
  stopSyncServer: () => Promise<{ success: boolean; message?: string }>
  onSyncRequest: (cb: (data: { syncId: string; deviceId: string; text: string }) => void) => void
  sendSyncResponse: (syncId: string, success: boolean, message?: string) => void
}
function electronAPI(): ElectronSyncAPI | null {
  return (window as unknown as { electronAPI?: ElectronSyncAPI }).electronAPI ?? null
}

// Setup global listener for incoming sync requests via IPC (desktop app only)
electronAPI()?.onSyncRequest(async (payload) => {
  const { deviceId, text } = payload
  const api = electronAPI()!
  const device = await devicesRepo.get(deviceId)
  if (!device) {
    api.sendSyncResponse(payload.syncId, false, 'Device not paired')
    return
  }

  try {
    const result = await applyPacket(device, text)
    // Build a return packet to send back to the client immediately
    const returnPacket = await buildPacket(device)

    toast(`Sync complete! Applied ${result.applied} updates.`)
    api.sendSyncResponse(payload.syncId, true, returnPacket.text)
  } catch (err) {
    api.sendSyncResponse(payload.syncId, false, err instanceof Error ? err.message : 'Sync failed')
  }
})

export function WiFiSyncDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ip, setIp] = useState<string>('')
  const [port] = useState(4000)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const api = electronAPI()

  useEffect(() => {
    if (open && api) {
      api.getLocalIp().then(setIp)
    } else if (!open) {
      stopServer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function startServer() {
    if (!api) return
    setLoading(true)
    const result = await api.startSyncServer(port)
    setLoading(false)
    if (result.success) {
      setRunning(true)
    } else {
      toast(`Failed to start server: ${result.message}`)
    }
  }

  async function stopServer() {
    if (!running || !api) return
    await api.stopSyncServer()
    setRunning(false)
  }

  if (!api) {
    return (
      <Dialog open={open} onClose={onClose} title="Local WiFi Sync" width={400}>
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <Wifi size={48} className="text-faint mb-4" />
          <p className="text-sm text-ink mb-1">This requires the Coachwright desktop app.</p>
          <p className="text-xs text-muted">
            WiFi sync runs a small local server on your computer so a client's device can reach it — only the desktop (Windows) build can host that. In the browser, use Local Export/Import instead.
          </p>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="Local WiFi Sync" width={400}>
      <div className="flex flex-col items-center justify-center p-4">
        {!running ? (
          <>
            <Wifi size={48} className="text-muted mb-4" />
            <p className="text-sm text-center text-ink mb-6">
              Start the local WiFi sync server to allow clients to securely sync their Companion app with Coachwright. Both devices must be on the same WiFi network.
            </p>
            <Button variant="primary" onClick={startServer} disabled={loading}>
              {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Wifi className="mr-2" size={16} />}
              Start Sync Server
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-center text-muted mb-4 uppercase tracking-wider font-semibold">
              Scan from Companion App
            </p>
            <div className="bg-white p-4 rounded-xl shadow-sm mb-6">
              <QRCodeSVG value={`http://${ip}:${port}`} size={200} />
            </div>
            <div className="bg-surface2 rounded-md p-3 w-full mb-6">
              <p className="text-xs text-faint text-center mb-1">Or enter address manually:</p>
              <p className="text-sm font-mono tnum text-center font-medium text-ink">
                http://{ip}:{port}
              </p>
            </div>
            <Button variant="ghost" onClick={stopServer} className="text-ember-600">
              <X size={16} className="mr-2" /> Stop Server
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
