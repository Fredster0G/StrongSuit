"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
let mainWindow = null;
let splashWindow = null;
let syncServer = null;
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}
function createWindow() {
    // Create Main Window
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        show: true,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // Load the Vite app
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    // Open devtools
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}
// Prevent new windows and arbitrary navigation
electron_1.app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        // Only allow local dev navigation
        if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
            event.preventDefault();
        }
    });
    contents.setWindowOpenHandler(({ url }) => {
        return { action: 'deny' };
    });
});
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// --- IPC Handlers for WiFi Sync ---
electron_1.ipcMain.handle('get-local-ip', () => {
    return getLocalIpAddress();
});
electron_1.ipcMain.handle('start-sync-server', async (event, port = 4000) => {
    if (syncServer) {
        return { success: false, message: 'Server already running' };
    }
    return new Promise((resolve) => {
        try {
            const expressApp = (0, express_1.default)();
            expressApp.use((0, cors_1.default)());
            expressApp.use(express_1.default.json({ limit: '50mb' }));
            // Endpoint for clients to push their packets (Session logs, etc.)
            expressApp.post('/sync/push', (req, res) => {
                const payload = req.body;
                // We forward this to the React app to process using dexie and crypto
                if (mainWindow) {
                    mainWindow.webContents.send('sync-request', payload);
                    // Wait for React to process it
                    electron_1.ipcMain.once('sync-response', (_evt, response) => {
                        if (response.success) {
                            res.status(200).json(response);
                        }
                        else {
                            res.status(400).json(response);
                        }
                    });
                }
                else {
                    res.status(500).json({ success: false, message: 'Coach app not ready' });
                }
            });
            // Endpoint for clients to pull their packets (Program updates)
            // For a truly offline feel, the client can just push their payload and receive the coach's payload in the same response.
            // But we can keep it standard.
            syncServer = expressApp.listen(port, '0.0.0.0', () => {
                resolve({ success: true, port });
            });
            syncServer.on('error', (err) => {
                resolve({ success: false, message: err.message });
            });
        }
        catch (e) {
            resolve({ success: false, message: e.message });
        }
    });
});
electron_1.ipcMain.handle('stop-sync-server', () => {
    if (syncServer) {
        syncServer.close();
        syncServer = null;
        return { success: true };
    }
    return { success: false, message: 'Server not running' };
});
