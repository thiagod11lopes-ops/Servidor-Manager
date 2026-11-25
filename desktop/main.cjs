const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const net = require('node:net')
const http = require('node:http')
const { spawn } = require('node:child_process')
const fs = require('node:fs')

/** @type {import('node:child_process').ChildProcess | null} */
let localServiceProcess = null

function resourcesLocalServiceDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'local-service')
  }
  return path.join(__dirname, '..', 'dist-local-service')
}

function packagedUiResolverModulePath() {
  const fromResources = path.join(
    process.resourcesPath,
    'manager-launcher',
    'validate-manager-ui-bundle.mjs',
  )
  if (fs.existsSync(fromResources)) return fromResources
  return path.join(__dirname, '..', 'scripts', 'validate-manager-ui-bundle.mjs')
}

async function resolveUiForWindow() {
  if (!app.isPackaged) {
    return {
      ok: true,
      indexPath: path.join(app.getAppPath(), 'dist', 'index.html'),
      source: 'dev-dist',
    }
  }

  const modulePath = pathToFileURL(packagedUiResolverModulePath()).href
  const { resolvePackagedUiIndex } = await import(modulePath)
  return resolvePackagedUiIndex({
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  })
}

function shouldStartEmbeddedLocalService() {
  if (app.isPackaged) return true
  const scriptPath = path.join(resourcesLocalServiceDir(), 'local-service.cjs')
  return fs.existsSync(scriptPath)
}

function getManagerDataRoot() {
  const fromEnv = process.env.SERVIDOR_MANAGER_DATA_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return 'C:\\ServidorManager'
}

function parseServicePort() {
  const raw = process.env.SERVIDOR_MANAGER_SERVICE_PORT?.trim()
  if (raw) {
    const n = Number(raw)
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n
  }
  return 47831
}

function ensureDataDirectories() {
  const root = getManagerDataRoot()
  for (const dir of ['systems', 'config', 'logs', 'data']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true })
  }
}

function startLocalService() {
  const serviceDir = resourcesLocalServiceDir()
  const scriptPath = path.join(serviceDir, 'local-service.cjs')
  const hostScript = path.join(serviceDir, 'service-host.cjs')

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Pacote incompleto: ${scriptPath} não encontrado.`)
  }

  const nodeExecutable = process.execPath
  const installRoot = path.dirname(process.execPath)
  const dataRoot = getManagerDataRoot()
  const servicePort = String(parseServicePort())
  localServiceProcess = spawn(nodeExecutable, [scriptPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      SM_NODE_PATH: nodeExecutable,
      SM_SERVICE_HOST_SCRIPT: hostScript,
      SM_RESOURCES_PATH: process.resourcesPath,
      SM_BOOTSTRAP_DIR: path.join(process.resourcesPath, 'server-bootstrap'),
      SERVIDOR_MANAGER_INSTALL_ROOT: installRoot,
      SERVIDOR_MANAGER_DATA_ROOT: process.env.SERVIDOR_MANAGER_DATA_ROOT?.trim() || dataRoot,
      SERVIDOR_MANAGER_SERVICE_PORT: process.env.SERVIDOR_MANAGER_SERVICE_PORT?.trim() || servicePort,
    },
    stdio: 'ignore',
    windowsHide: true,
  })

  localServiceProcess.on('exit', (code) => {
    localServiceProcess = null
    if (code && code !== 0) {
      console.error(`local-service encerrado (código ${code})`)
    }
  })
}

function waitForLocalService(timeoutMs = 45_000) {
  const host = '127.0.0.1'
  const port = parseServicePort()
  const started = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host, port }, () => {
        socket.end()
        resolve(undefined)
      })
      socket.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('local-service não respondeu a tempo.'))
          return
        }
        setTimeout(attempt, 250)
      })
    }
    attempt()
  })
}

function stopLocalService() {
  if (localServiceProcess && !localServiceProcess.killed) {
    localServiceProcess.kill()
  }
  localServiceProcess = null
}

function hasBundledOmpsPayload() {
  return fs.existsSync(path.join(process.resourcesPath, 'omps-payload'))
}

function getProductDisplayName() {
  if (app.isPackaged && hasBundledOmpsPayload()) return 'Servidor OMPS'
  return 'Servidor Manager'
}

function fetchBundledOmpsFirstRunPending(timeoutMs = 5_000) {
  if (!hasBundledOmpsPayload()) {
    return Promise.resolve(false)
  }
  const port = parseServicePort()
  const started = Date.now()

  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/v1/products/bundled-omps/status',
          timeout: 4_000,
        },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => {
            body += chunk
          })
          res.on('end', () => {
            try {
              const status = JSON.parse(body)
              resolve(Boolean(status?.ok && status?.available && !status?.firstRun?.completed))
            } catch {
              resolve(false)
            }
          })
        },
      )
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          resolve(false)
          return
        }
        setTimeout(attempt, 250)
      })
      req.on('timeout', () => {
        req.destroy()
        if (Date.now() - started > timeoutMs) {
          resolve(false)
          return
        }
        setTimeout(attempt, 250)
      })
    }
    attempt()
  })
}

async function createWindow() {
  const productDisplayName = getProductDisplayName()
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: productDisplayName,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  win.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault()
    win.setTitle(title?.trim() || productDisplayName)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const uiResolution = await resolveUiForWindow()
  if (!uiResolution.ok) {
    const detailParts = [
      uiResolution.reason,
      uiResolution.detail ? String(uiResolution.detail) : '',
      uiResolution.recovery ?? '',
    ].filter(Boolean)
    dialog.showErrorBox(
      `${productDisplayName} — interface indisponível`,
      detailParts.join('\n\n'),
    )
    app.quit()
    return
  }

  if (uiResolution.warning) {
    console.warn(uiResolution.warning)
  }

  const indexPath = uiResolution.indexPath
  const servidorOmpsProduct = fs.existsSync(
    path.join(process.resourcesPath, 'servidor-omps-product.json'),
  )
  if (servidorOmpsProduct) {
    await win.loadFile(indexPath, { hash: '/dashboard' })
  } else {
    const openBundledOmpsSetup = await fetchBundledOmpsFirstRunPending()
    if (openBundledOmpsSetup) {
      await win.loadFile(indexPath, { hash: '/servidor-omps' })
    } else {
      await win.loadFile(indexPath)
    }
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  ipcMain.handle('dialog:pickProjectFolder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory'],
    })
    if (canceled || filePaths.length === 0) {
      return { ok: false, cancelled: true }
    }
    return { ok: true, path: filePaths[0] }
  })

  app.whenReady().then(async () => {
    app.setName(getProductDisplayName())
    ensureDataDirectories()
    if (shouldStartEmbeddedLocalService()) {
      try {
        startLocalService()
        await waitForLocalService()
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        dialog.showErrorBox(
          `${getProductDisplayName()} — serviço local`,
          `O serviço interno (porta 47831) não iniciou.\n\n${detail}\n\nAnálise REAL e Instalar não funcionam sem ele. Feche outras instâncias, reinicie o PC ou reinstale pelo atalho atualizado.`,
        )
      }
    }
    await createWindow()
  })

  app.on('before-quit', () => {
    stopLocalService()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
