const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  version: () => process.versions.electron,
  listProfiles: () => ipcRenderer.invoke('list-profiles'),
  saveProfile: (name, data) => ipcRenderer.invoke('save-profile', { name, data }),
  saveRootPlayer: (player) => ipcRenderer.invoke('save-root-player', { player }),
  loadProfile: (name) => ipcRenderer.invoke('load-profile', { name }),
  deleteProfile: (name) => ipcRenderer.invoke('delete-profile', { name })
  ,
  windowControl: (action) => ipcRenderer.invoke('window-control', { action })
});
