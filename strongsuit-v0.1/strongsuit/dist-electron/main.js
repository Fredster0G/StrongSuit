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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const crypto_1 = require("crypto");
const url_1 = require("url");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const menu_1 = require("./menu");
const windowState_1 = require("./windowState");
const APP_NAME = 'Coachwright';
const APP_SCHEME = 'app';
// Registered before `app.ready` (required — Electron docs) so the scheme
// behaves like http/https for relative-URL resolution (`standard: true`,
// needed because index.html's assets use relative `./assets/...` paths) and
// can serve ES modules (`supportFetchAPI`/`corsEnabled`).
//
// THIS IS THE ACTUAL FIX for the packaged app never having worked: it always
// shipped via `loadFile()` over the raw `file://` protocol, and Chromium
// treats every `file://` document as its own opaque origin — which blocks
// `<script type="module">` and the `modulePreload`/dynamic `import()` calls
// this app's route code-splitting depends on with a bare `ERR_FAILED`, no
// further detail. Dev mode never hit this because it loads over a real
// `http://localhost:5173` origin. Serving the packaged build over a custom
// privileged scheme instead — the standard fix for Electron + Vite ESM
// output — gives it a real, stable origin ES modules can load under.
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme: APP_SCHEME,
        privileges: {
            standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
            // src/main.tsx registers ./sw.js (PROD builds only) for offline PWA
            // caching — without this flag that registration would silently fail
            // under a custom scheme (silently, since it's wrapped in .catch(()=>{})
            // there on purpose; still worth actually supporting rather than
            // relying on the failure being harmless).
            allowServiceWorkers: true,
        },
    },
]);
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
    // Splash shows immediately (native window boot is instant; the renderer's
    // own BootScreen takes over once the page itself loads) — frameless, no
    // chrome, closed the moment the main window is ready to paint.
    //
    // Path note: splash.html is a static asset in electron/, and `tsc` only
    // emits .js — it was never copied into dist-electron/, so the previous
    // `path.join(__dirname, 'splash.html')` resolved to a file that does not
    // exist and every launch logged ERR_FILE_NOT_FOUND behind a blank splash
    // window. `electron/**/*` is in package.json's build.files, so going up one
    // level from dist-electron/ works in the packaged app too.
    const splashPath = path.join(__dirname, '../electron/splash.html');
    if (fs.existsSync(splashPath)) {
        splashWindow = new electron_1.BrowserWindow({
            width: 360,
            height: 360,
            frame: false,
            resizable: false,
            transparent: false,
            backgroundColor: '#171A1E',
            show: true,
            webPreferences: { contextIsolation: true, nodeIntegration: false },
        });
        splashWindow.loadFile(splashPath);
    }
    // Create Main Window, restoring last session's size/position (T11).
    const saved = (0, windowState_1.loadWindowState)();
    const isMac = process.platform === 'darwin';
    mainWindow = new electron_1.BrowserWindow({
        x: saved.x,
        y: saved.y,
        width: saved.width,
        height: saved.height,
        minWidth: windowState_1.MIN_SIZE.width,
        minHeight: windowState_1.MIN_SIZE.height,
        show: false,
        // macOS keeps the native inset traffic lights — already looks right, and
        // the app menu lives in the system-wide bar outside the window. Windows
        // and Linux go fully frameless: the native fallback for those platforms
        // is a boxy classic title bar plus an always-visible menu row, which
        // reads as dated. TitleBar.tsx (renderer) draws the real chrome for
        // those platforms instead, driven by the IPC handlers below.
        ...(isMac ? { titleBarStyle: 'hiddenInset' } : { frame: false }),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    (0, menu_1.buildAppMenu)(mainWindow, APP_NAME);
    (0, windowState_1.trackWindowState)(mainWindow);
    // Per-window events (not per-app IPC channels, so re-adding these on a
    // second createWindow() call — the macOS `activate`-with-no-windows path —
    // is fine; each new mainWindow gets its own listeners).
    mainWindow.on('maximize', () => mainWindow?.webContents.send('window-maximized-change', true));
    mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-maximized-change', false));
    mainWindow.once('ready-to-show', () => {
        splashWindow?.close();
        splashWindow = null;
        // Maximize before showing, so a restored-maximized window doesn't visibly
        // pop from its windowed size to full screen on every launch.
        if (saved.maximized)
            mainWindow?.maximize();
        mainWindow?.show();
    });
    mainWindow.on('closed', () => { mainWindow = null; });
    // Load the Vite app. Dev talks to the real Vite dev server (a genuine
    // http:// origin, so ES modules load with no special handling needed).
    // Packaged loads over the app:// protocol registered in app.whenReady()
    // below — see the scheme-registration comment up top for why this can't
    // just be loadFile() over file://.
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    }
    else {
        mainWindow.loadURL(`${APP_SCHEME}://coachwright/index.html`);
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
        // Dev server, the packaged app's own app:// origin, or (legacy) file://
        // — anything else gets blocked.
        const allowed = parsedUrl.origin === 'http://localhost:5173'
            || navigationUrl.startsWith(`${APP_SCHEME}://`)
            || navigationUrl.startsWith('file://');
        if (!allowed) {
            event.preventDefault();
        }
    });
    contents.setWindowOpenHandler(({ url }) => {
        return { action: 'deny' };
    });
});
electron_1.app.whenReady().then(() => {
    // Serves the packaged renderer over app:// instead of file:// — see the
    // scheme-registration comment near the top of this file. `request.url`
    // for the document itself is `app://coachwright/index.html`; every asset
    // it references with a relative path (`./assets/x.js`) arrives here as
    // `app://coachwright/assets/x.js`, since `standard: true` above makes this
    // scheme resolve relative URLs the same way http/https do.
    electron_1.protocol.handle(APP_SCHEME, request => {
        const { pathname } = new URL(request.url);
        const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
        const filePath = path.join(__dirname, '../dist', relative);
        return electron_1.net.fetch((0, url_1.pathToFileURL)(filePath).toString());
    });
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
// --- IPC Handlers for the custom window chrome (TitleBar.tsx) ---
// Windows/Linux run with frame:false (see createWindow), which drops the
// native minimize/maximize/close affordances and the menu bar's display —
// these replace them. Registered once at module scope, not inside
// createWindow, since ipcMain.handle throws if a channel is registered
// twice and createWindow can run again (macOS activate-with-no-windows).
electron_1.ipcMain.handle('window-minimize', () => { mainWindow?.minimize(); });
electron_1.ipcMain.handle('window-maximize-toggle', () => {
    if (!mainWindow)
        return;
    if (mainWindow.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow.maximize();
});
electron_1.ipcMain.handle('window-close', () => { mainWindow?.close(); });
electron_1.ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);
electron_1.ipcMain.handle('show-app-menu', () => {
    if (mainWindow)
        electron_1.Menu.getApplicationMenu()?.popup({ window: mainWindow });
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
            // Endpoint for a Companion client on the same WiFi to push its sealed
            // packet. The renderer (which owns Dexie + the pairing keys) applies
            // it and answers with the coach's return packet in `message` — so one
            // POST is a full two-way sync. Each request gets its own syncId and
            // listener: two clients syncing at once can't take each other's
            // responses, and a renderer that never answers times out instead of
            // holding the client's request open forever.
            expressApp.post('/sync/push', (req, res) => {
                if (!mainWindow) {
                    res.status(500).json({ success: false, message: 'Coach app not ready' });
                    return;
                }
                const syncId = (0, crypto_1.randomUUID)();
                const listener = (_evt, response) => {
                    if (response?.syncId !== syncId)
                        return;
                    electron_1.ipcMain.removeListener('sync-response', listener);
                    clearTimeout(timer);
                    res.status(response.success ? 200 : 400).json(response);
                };
                const timer = setTimeout(() => {
                    electron_1.ipcMain.removeListener('sync-response', listener);
                    res.status(504).json({ success: false, message: 'Coach app did not respond' });
                }, 30_000);
                electron_1.ipcMain.on('sync-response', listener);
                mainWindow.webContents.send('sync-request', { ...req.body, syncId });
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
