import { app, BrowserWindow, shell, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadDesktopConfig } from './lib/load-config.mjs'
import { resolveStartUrlFromServer } from './lib/fetch-server-connection.mjs'
import { bootstrapOverlayForClient } from './lib/overlay/bootstrap-overlay.mjs'
import { stopWireGuardTunnel } from './lib/overlay/wireguard-run.mjs'
import { resolveInstallDirFromConfig } from './lib/install-dir.mjs'
import { discoverOmpsLanServers } from './lib/discover-omps-lan.mjs'
import { writeDesktopConfigObject, readDesktopConfigObject } from './lib/desktop-config-file.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
let mainWindow = null

function selectDiscoveredServerSync(servers) {
  if (servers.length === 1) return servers[0]
  const buttons = servers.map((s) => `${s.displayName} (${s.host})`)
  buttons.push('Cancelar')
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    title: 'Vários Servidores OMPS',
    message: 'Foram encontrados vários servidores OMPS na rede local. Escolha qual utilizar:',
    detail: servers.map((s) => `${s.displayName}\n${s.loginUrl}`).join('\n\n'),
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  })
  if (choice >= servers.length) return null
  return servers[choice]
}

async function resolveServerEndpoint(cfg) {
  if (cfg.lanDiscovery && cfg.lanAccess) {
    const discovered = await discoverOmpsLanServers({
      udpPort: cfg.lanAccess.discoveryUdpPort,
      attempts: 3,
    })
    if (discovered.servers.length > 0) {
      const picked = selectDiscoveredServerSync(discovered.servers)
      if (!picked) {
        throw new Error('Conexão cancelada — nenhum Servidor OMPS selecionado.')
      }
      return {
        startUrl: picked.loginUrl,
        origin: picked.origin,
        contractUrls: {
          loginUrl: picked.loginUrl,
          origin: picked.origin,
          host: picked.host,
          port: picked.httpPort,
          baseUrl: picked.origin,
        },
        discoveryMeta: { source: 'lan-udp', detail: discovered.detail },
      }
    }

    if (cfg.lastKnownOrigin) {
      const loginUrl = `${cfg.lastKnownOrigin.replace(/\/+$/, '')}/login`
      return {
        startUrl: loginUrl,
        origin: cfg.lastKnownOrigin.replace(/\/+$/, ''),
        contractUrls: {
          loginUrl,
          origin: cfg.lastKnownOrigin.replace(/\/+$/, ''),
          host: new URL(cfg.lastKnownOrigin).hostname,
          port: cfg.lanAccess.requiredHttpPort,
          baseUrl: cfg.lastKnownOrigin.replace(/\/+$/, ''),
        },
        discoveryMeta: {
          source: 'last-known-origin',
          detail: 'Descoberta UDP falhou; tentando último endereço conhecido.',
        },
      }
    }

    throw new Error(
      [
        'Nenhum Servidor OMPS encontrado na rede local.',
        discovered.detail,
        'Verifique se o Servidor OMPS está em execução na mesma rede Wi‑Fi/Ethernet, se a porta UDP 47808 e a porta HTTP anunciada estão liberadas no firewall.',
      ].join('\n'),
    )
  }

  if (!cfg.startUrl) {
    throw new Error('Endereço do servidor não configurado e descoberta LAN está desativada.')
  }
  return {
    startUrl: cfg.startUrl,
    origin: cfg.origin,
    contractUrls: cfg.contractUrls,
    discoveryMeta: null,
  }
}

function persistLastKnownOrigin(cfg, origin) {
  const path = cfg.configPath ?? cfg.raw?._configPath
  if (!path) return
  try {
    const current = readDesktopConfigObject(path).data
    writeDesktopConfigObject(path, {
      ...current,
      lastKnownOrigin: origin,
      lanDiscovery: cfg.lanDiscovery !== false,
      discoverConnection: true,
    })
  } catch {
    // não bloqueia abertura
  }
}

async function resolveLaunchUrl() {
  const cfg = loadDesktopConfig({ cwd: __dirname })
  const overlay = await bootstrapOverlayForClient({ cwd: __dirname })

  if (overlay.overlayStartUrl) {
    console.log('[acompopms-cliente] overlay URL:', overlay.overlayStartUrl)
    return { startUrl: overlay.overlayStartUrl, cfg, discovery: null, overlay }
  }
  if (overlay.tunnel?.status === 'skipped' || overlay.tunnel?.status === 'failed') {
    console.warn('[acompopms-cliente] WireGuard:', overlay.tunnel.message)
  } else if (overlay.tunnel?.status === 'active') {
    console.log('[acompopms-cliente] WireGuard:', overlay.tunnel.message)
  }

  const endpoint = await resolveServerEndpoint(cfg)
  let startUrl = endpoint.startUrl
  let origin = endpoint.origin
  const contractUrls = endpoint.contractUrls

  if (cfg.discoverConnection) {
    const contractWithLan =
      contractUrls && cfg.lanAccess ? { ...contractUrls, lanAccess: cfg.lanAccess } : contractUrls
    const discovery = await resolveStartUrlFromServer(origin, startUrl, 8000, contractWithLan)
    if (discovery.serverUnreachable) {
      const reason = discovery.unreachableReason ?? discovery.detail ?? 'Sem resposta HTTP.'
      throw new Error(
        [
          `Servidor OMPS indisponível em ${contractUrls?.loginUrl ?? startUrl}.`,
          reason,
          'Confirme firewall (HTTP / UDP 47808) e se o Servidor OMPS está ativo.',
        ].join('\n'),
      )
    }
    startUrl = discovery.startUrl
    const persistedOrigin = contractUrls?.origin ?? origin
    persistLastKnownOrigin(cfg, persistedOrigin)
    return { startUrl, cfg, discovery, overlay, discoveryMeta: endpoint.discoveryMeta }
  }

  return { startUrl, cfg, discovery: endpoint.discoveryMeta, overlay }
}

function createWindow(startUrl, title) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: title || 'AcompOPMS',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url)
      const home = new URL(startUrl)
      if (target.origin !== home.origin) {
        event.preventDefault()
        shell.openExternal(url)
      }
    } catch {
      event.preventDefault()
    }
  })

  mainWindow.loadURL(startUrl)
  return mainWindow
}

app.whenReady().then(async () => {
  try {
    const { startUrl, cfg, discovery } = await resolveLaunchUrl()
    if (discovery?.source === 'server-connection.json') {
      console.log('[acompopms-cliente] URL do servidor:', startUrl)
    } else if (discovery?.detail) {
      console.warn('[acompopms-cliente] conexão:', discovery.detail)
    }
    console.log('[acompopms-cliente] config:', cfg.source)
    createWindow(startUrl, cfg.windowTitle)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    dialog.showErrorBox('AcompOPMS — configuração', msg)
    app.exit(1)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      resolveLaunchUrl()
        .then(({ startUrl, cfg }) => createWindow(startUrl, cfg.windowTitle))
        .catch(() => app.exit(1))
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopWireGuardTunnel(resolveInstallDirFromConfig(__dirname))
})
