const { contextBridge, ipcRenderer } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

function detectPackagedBundledOmps() {
  try {
    const resourcesPath = process.resourcesPath
    if (!resourcesPath) return false
    const payloadDir = path.join(resourcesPath, 'omps-payload')
    const metaFile = path.join(resourcesPath, 'omps-bundle', 'bundle-meta.json')
    return fs.existsSync(payloadDir) && fs.existsSync(metaFile)
  } catch {
    return false
  }
}

contextBridge.exposeInMainWorld('servidorManager', {
  pickProjectFolder: () => ipcRenderer.invoke('dialog:pickProjectFolder'),
  packagedProduct: {
    bundledOmps: detectPackagedBundledOmps(),
  },
})
