const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('manimBlocks', {
  saveTextFile: (opts) => ipcRenderer.invoke('file:save-text', opts),
});
