import { app, Menu, shell, dialog, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

// Native application menu (T11, debt #25). Before this the desktop app had no
// menu bar at all, so there was no Edit menu — which on Windows/Linux also
// means no working Cut/Copy/Paste accelerators in a packaged build, since
// those shortcuts are wired up by menu roles, not by the OS.
//
// Navigation items don't touch the renderer's router directly; they send an
// IPC message that the renderer turns into a route change (see preload's
// `onMenuNavigate`). Injecting `location.hash` from the main process via
// executeJavaScript would work too, but this app deliberately runs with
// contextIsolation on and a navigation allowlist, and script injection from
// the main process cuts against that posture.

const isMac = process.platform === 'darwin'

export function buildAppMenu(win: BrowserWindow, appName: string): void {
  const go = (path: string) => () => win.webContents.send('menu-navigate', path)

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: appName,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: '&File',
      submenu: [
        { label: 'New Client', accelerator: 'CmdOrCtrl+Shift+N', click: go('/clients?new=1') },
        { label: 'Log a Session', accelerator: 'CmdOrCtrl+L', click: go('/log') },
        { type: 'separator' },
        // Backup lives in Settings → Data; the menu takes you there rather than
        // firing an export behind your back, since restore is destructive and
        // the export has options (plain vs. encrypted).
        { label: 'Backup & Restore…', click: go('/settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&Go',
      submenu: [
        { label: 'Today', accelerator: 'CmdOrCtrl+1', click: go('/') },
        { label: 'Clients', accelerator: 'CmdOrCtrl+2', click: go('/clients') },
        { label: 'Programs', accelerator: 'CmdOrCtrl+3', click: go('/programs') },
        { label: 'Exercises', accelerator: 'CmdOrCtrl+4', click: go('/exercises') },
        { label: 'Film Room', accelerator: 'CmdOrCtrl+5', click: go('/film-room') },
        { label: 'Calendar', accelerator: 'CmdOrCtrl+6', click: go('/calendar') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: go('/settings') },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // Kept in the shipped build on purpose: this app stores everything
        // locally with no server-side logs, so when a coach hits a problem the
        // browser console is the only diagnostic anyone can ask them for.
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: '&Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }]),
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: `${appName} Guide`, click: go('/settings?tab=guide') },
        {
          label: 'Show Data Folder',
          // Where a coach's local database and backups actually live — the
          // single most useful thing to be able to point someone at when
          // they ask "where is my data?" for an app with no cloud account.
          click: () => { void shell.openPath(app.getPath('userData')) },
        },
        { type: 'separator' },
        {
          label: `About ${appName}`,
          click: () => {
            void dialog.showMessageBox(win, {
              type: 'info',
              title: `About ${appName}`,
              message: appName,
              detail: `Version ${app.getVersion()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}\n\nYour data lives on this computer. No account, no subscription, no server.`,
              buttons: ['OK'],
            })
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
