const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getFiles: () => ipcRenderer.invoke('get-files'),
  getDoneFiles: () => ipcRenderer.invoke('get-done-files'),
  getLogFiles: () => ipcRenderer.invoke('get-log-files'),
  readLogFile: (name) => ipcRenderer.invoke('read-log-file', name),
  getFileLog: (filename) => ipcRenderer.invoke('get-file-log', filename),
  processFile: (filename) => ipcRenderer.invoke('process-file', filename),
  openFolder: (folder) => ipcRenderer.invoke('open-folder', folder),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  setInputFolder: () => ipcRenderer.invoke('set-input-folder'),
  setOutputFolder: () => ipcRenderer.invoke('set-output-folder'),
});
