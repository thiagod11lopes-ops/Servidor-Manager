const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ompsHub', {
  getStatus: () => ipcRenderer.invoke('hub:getStatus'),
  launch: (choice) => ipcRenderer.invoke('hub:launch', choice),
  cancel: () => ipcRenderer.invoke('hub:cancel'),
})
