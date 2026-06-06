const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('isolator', {
  getBackendUrl: () => invoke('backend:get-url'),
  getBackendToken: () => invoke('backend:get-token'),
  windowMinimize: () => invoke('window:minimize'),
  windowCloseToTray: () => invoke('window:close-to-tray'),
  showWindow: () => invoke('window:show'),
  getAppSettings: () => invoke('app-settings:get'),
  updateAppSettings: (settings) => invoke('app-settings:update', settings),
  reportStatus: (status) => invoke('tray:status', status),
  onTrayShow: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tray:show-window', listener);
    return () => ipcRenderer.removeListener('tray:show-window', listener);
  }
});
