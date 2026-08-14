import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Wifi, X } from 'lucide-react'
import { Dialog, Button, toast, LogoSpinner } from '@/design'
import { devicesRepo } from '@/db/repo'
import { buildPacket, applyPacket } from './syncApi'
import { useTranslation } from '@/lib/i18n'

/** Present only inside the Electron desktop build (see electron/preload.ts). */
interface ElectronSyncAPI {
  getLocalIp: () => Promise<string>
  startSyncServer: (port?: number) => Promise<{ success: boolean; port?: number; message?: string }>
  stopSyncServer: () => Promise<{ success: boolean; message?: string }>
  onSyncRequest: (cb: (data: { syncId: string; deviceId: string; text: string }) => void) => void
  sendSyncResponse: (syncId: string, success: boolean, message?: string) => void
  onMenuNavigate?: (cb: (path: string) => void) => () => void
}
function electronAPI(): ElectronSyncAPI | null {
  // `typeof window` guard, not a bare `window` read: this is called at module
  // scope (below), so an environment without a DOM — a test runner, a worker,
  // any future SSR/prerender step — would throw on import rather than on use,
  // taking the whole ClientDetailPage chunk down with it. Caught by
  // app/routes.smoke.test.ts.
  if (typeof window === 'undefined') return null
  return (window as unknown as { electronAPI?: ElectronSyncAPI }).electronAPI ?? null
}

export function WiFiSyncDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ip, setIp] = useState<string>('')
  const [port, setPort] = useState<number | undefined>()
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const api = electronAPI()
  const { t } = useTranslation()

  useEffect(() => {
    if (open && api) {
      api.getLocalIp().then(setIp)
    } else if (!open) {
      stopServer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Registers the IPC handler for an incoming sync request from a client's
  // Companion app. Was previously a module-scope `electronAPI()?.onSyncRequest(...)`
  // call that referenced this component's own `api`/`t` from OUTSIDE the
  // component — those don't exist at module scope, so this whole handler
  // was dead code (a TypeError waiting to happen, never actually reachable
  // since `api`/`t`/`applyPacket`/`buildPacket` were all unresolved
  // identifiers). Scoped as a proper effect now, registered once `api`
  // exists — no dependency on `open`, since a sync request can arrive while
  // this dialog is closed but the server (started earlier) is still running.
  useEffect(() => {
    if (!api) return
    api.onSyncRequest(async (payload) => {
      const { deviceId, text, syncId } = payload
      const device = await devicesRepo.get(deviceId)
      if (!device) {
        api.sendSyncResponse(syncId, false, 'Device not paired')
        return
      }

      try {
        const result = await applyPacket(device, text)
        // Build a return packet to send back to the client immediately
        const returnPacket = await buildPacket(device)

        toast(t('sync.toast.syncComplete', { applied: String(result.applied) }))
        api.sendSyncResponse(syncId, true, returnPacket.text)
      } catch (err) {
        api.sendSyncResponse(syncId, false, err instanceof Error ? err.message : 'Sync failed')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  async function startServer() {
    if (!api) return
    setLoading(true)
    const result = await api.startSyncServer()
    setLoading(false)
    if (result.success) {
      setPort(result.port)
      setRunning(true)
    } else {
      toast(t('sync.toast.serverStartFailed', { message: result.message || '' }))
    }
  }

  async function stopServer() {
    if (!running || !api) return
    await api.stopSyncServer()
    setRunning(false)
  }

  if (!api) {
    return (
      <Dialog open={open} onClose={onClose} title={t('sync.wifi.title')} width={400}>
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <Wifi size={48} className="text-faint mb-4" />
          <p className="text-sm text-ink mb-1">{t('sync.wifi.requiresDesktop')}</p>
          <p className="text-xs text-muted">
            {t('sync.wifi.notDesktopBody')}
          </p>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('sync.wifi.title')} width={400}>
      <div className="flex flex-col items-center justify-center p-4">
        {!running ? (
          <>
            <Wifi size={48} className="text-muted mb-4" />
            <p className="text-sm text-center text-ink mb-6">
              {t('sync.wifi.startBody')}
            </p>
            <Button variant="primary" onClick={startServer} disabled={loading}>
              {loading ? <LogoSpinner className="me-2" size={16} /> : <Wifi className="me-2" size={16} />}
              {t('sync.wifi.startBtn')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-center text-muted mb-4 uppercase tracking-wider font-semibold">
              {t('sync.wifi.scanLabel')}
            </p>
            <div className="bg-white p-4 rounded-xl shadow-sm mb-6">
              <QRCodeSVG value={`http://${ip}:${port}`} size={200} />
            </div>
            <div className="bg-surface2 rounded-md p-3 w-full mb-6">
              <p className="text-xs text-faint text-center mb-1">{t('sync.wifi.manualLabel')}</p>
              <p className="text-sm font-mono tabular-nums text-center font-medium text-ink">
                http://{ip}:{port}
              </p>
            </div>
            <Button variant="ghost" onClick={stopServer} className="text-ember-600">
              <X size={16} className="me-2" /> {t('sync.wifi.stopBtn')}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
