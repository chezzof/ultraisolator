const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('isolator', {
  backendRequest: (request) => ipcRenderer.invoke('backend:request', request),
  startLiveSnapshot: () => ipcRenderer.invoke('live:start'),
  stopLiveSnapshot: () => ipcRenderer.invoke('live:stop'),
  onLiveSnapshot: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('live:event', listener);
    return () => ipcRenderer.removeListener('live:event', listener);
  },
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowCloseToTray: () => ipcRenderer.invoke('window:close-to-tray'),
  showWindow: () => ipcRenderer.invoke('window:show'),
  getAppSettings: () => ipcRenderer.invoke('app-settings:get'),
  updateAppSettings: (settings) => ipcRenderer.invoke('app-settings:update', settings),
  reportStatus: (status) => ipcRenderer.invoke('tray:status', status),
  onTrayShow: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tray:show-window', listener);
    return () => ipcRenderer.removeListener('tray:show-window', listener);
  }
});
