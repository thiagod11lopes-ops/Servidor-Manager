import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchWindowsSubinstaller } from './src/launchSubinstaller.mjs'
import { resolveLaunchTarget, resolveSubinstallers } from './src/subinstallerManifest.mjs'
import { OMPS_UNIFIED_MANIFEST_FILENAME } from '../scripts/omps-unified-product-spec.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
let win = null
let isQuitting = false

function subinstallersRoot() {
  return join(process.resourcesPath, 'subinstallers')
}

function loadManifest() {
  const manifestPath = join(process.resourcesPath, OMPS_UNIFIED_MANIFEST_FILENAME)
  if (!existsSync(manifestPath)) return {}
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function createWindow() {
  win = new BrowserWindow({
    width: 640,
    height: 520,
    resizable: false,
    title: 'OMPS — Instalação',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.loadFile(join(__dirname, 'ui', 'index.html'))
  win.on('close', () => {
    win = null
  })
}

ipcMain.handle('hub:getStatus', async () => {
  const manifest = loadManifest()
  const resolved = resolveSubinstallers(subinstallersRoot(), manifest)
  return {
    manifestSchema: manifest.schema ?? null,
    ompsVersion: manifest.ompsVersion ?? null,
    serverAvailable: resolved.ok.server,
    clientAvailable: resolved.ok.client,
    serverMessage: resolved.messages.serverMissing,
    clientMessage: resolved.messages.clientMissing,
    serverDataRoot: manifest.server?.dataRootWindows ?? 'C:\\ServidorManager',
    clientInstallHint: '%LOCALAPPDATA%\\AcompOPMS',
  }
})

ipcMain.handle('hub:launch', async (_evt, choice) => {
  if (choice !== 'server' && choice !== 'client') {
    return { ok: false, message: 'Escolha inválida.' }
  }
  const manifest = loadManifest()
  const target = resolveLaunchTarget(subinstallersRoot(), manifest, choice)
  if (!target.ok) {
    return { ok: false, message: target.message }
  }

  try {
    const message =
      choice === 'server'
        ? 'Instalador do Servidor OMPS iniciado. Siga o assistente NSIS (dados em C:\\ServidorManager). Esta janela do OMPS será fechada para evitar conflito com a instalação.'
        : 'Instalador do OMPS Usuário iniciado. Informe a URL do servidor no assistente.'
    if (choice === 'server') {
      const launched = await launchWindowsSubinstaller(target.executable)
      if (!launched.ok) {
        return { ok: false, message: launched.message }
      }
      isQuitting = true
      app.exit(0)
      return {
        ok: true,
        message,
        kind: target.kind,
      }
    }
    const child = spawn(target.executable, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      shell: false,
    })
    child.unref()
    return {
      ok: true,
      message,
      kind: target.kind,
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `Não foi possível iniciar o subinstalador: ${detail}` }
  }
})

ipcMain.handle('hub:cancel', async () => {
  isQuitting = true
  app.quit()
  return { ok: true }
})

app.whenReady().then(createWindow)

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  isQuitting = true
  app.quit()
})

process.on('uncaughtException', (err) => {
  if (isQuitting) return
  dialog.showErrorBox('OMPS', err?.message ?? String(err))
})

process.on('unhandledRejection', (reason) => {
  if (isQuitting) return
  const msg = reason instanceof Error ? reason.message : String(reason)
  dialog.showErrorBox('OMPS', msg)
})
