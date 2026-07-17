"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getLocalIp: () => electron_1.ipcRenderer.invoke('get-local-ip'),
    startSyncServer: (port) => electron_1.ipcRenderer.invoke('start-sync-server', port),
    stopSyncServer: () => electron_1.ipcRenderer.invoke('stop-sync-server'),
    onSyncRequest: (callback) => {
        electron_1.ipcRenderer.on('sync-request', (_event, data) => callback(data));
    },
    sendSyncResponse: (syncId, success, message) => {
        electron_1.ipcRenderer.invoke('sync-response', { syncId, success, message });
    }
});
