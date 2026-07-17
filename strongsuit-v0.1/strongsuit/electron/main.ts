import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as os from 'os'
import express from 'express'
import cors from 'cors'
import { Server } from 'http'

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let syncServer: Server | null = null

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function createWindow() {
  // Create Main Window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true, 
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load the Vite app
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open devtools
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }
}



// Prevent new windows and arbitrary navigation
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // Only allow local dev navigation
    if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
      event.preventDefault()
    }
  })
  
  contents.setWindowOpenHandler(({ url }) => {
    return { action: 'deny' }
  })
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --- IPC Handlers for WiFi Sync ---

ipcMain.handle('get-local-ip', () => {
  return getLocalIpAddress()
})

ipcMain.handle('start-sync-server', async (event, port = 4000) => {
  if (syncServer) {
    return { success: false, message: 'Server already running' }
  }

  return new Promise((resolve) => {
    try {
      const expressApp = express()
      expressApp.use(cors())
      expressApp.use(express.json({ limit: '50mb' }))

      // Endpoint for clients to push their packets (Session logs, etc.)
      expressApp.post('/sync/push', (req, res) => {
        const payload = req.body
        // We forward this to the React app to process using dexie and crypto
        if (mainWindow) {
          mainWindow.webContents.send('sync-request', payload)
          
          // Wait for React to process it
          ipcMain.once('sync-response', (_evt, response) => {
             if (response.success) {
               res.status(200).json(response)
             } else {
               res.status(400).json(response)
             }
          })
        } else {
          res.status(500).json({ success: false, message: 'Coach app not ready' })
        }
      })

      // Endpoint for clients to pull their packets (Program updates)
      // For a truly offline feel, the client can just push their payload and receive the coach's payload in the same response.
      // But we can keep it standard.

      syncServer = expressApp.listen(port, '0.0.0.0', () => {
        resolve({ success: true, port })
      })

      syncServer.on('error', (err: any) => {
        resolve({ success: false, message: err.message })
      })

    } catch (e: any) {
      resolve({ success: false, message: e.message })
    }
  })
})

ipcMain.handle('stop-sync-server', () => {
  if (syncServer) {
    syncServer.close()
    syncServer = null
    return { success: true }
  }
  return { success: false, message: 'Server not running' }
})
