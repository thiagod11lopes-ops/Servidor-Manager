import dgram from 'node:dgram'
import {
  OMPS_LAN_DISCOVERY_UDP_PORT,
  buildOmpsLanDiscoveryRequestBuffer,
  parseOmpsLanDiscoveryResponse,
} from './omps-lan-discovery-protocol.mjs'
import { listOmpsLanDiscoveryBroadcastTargets } from './discover-lan-interfaces.mjs'

const SERVER_CONNECTION_SCHEMA = 'acomopms-server-connection/1'

function listBroadcastTargets() {
  const targets = new Set(['255.255.255.255'])
  for (const entry of listOmpsLanDiscoveryBroadcastTargets()) {
    targets.add(entry.broadcast)
  }
  return [...targets]
}

/**
 * @param {string} url
 * @param {number} timeoutMs
 * @param {{ host: string, httpPort: number, instanceId: string, origin: string, loginUrl: string }} candidate
 */
async function validateServerConnection(url, timeoutMs, candidate) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` }
    const body = await r.json()
    if (body?.schema !== SERVER_CONNECTION_SCHEMA) {
      return { ok: false, detail: 'server-connection.json com schema inesperado' }
    }
    const port = body?.lan?.httpPort
    if (port !== candidate.httpPort) {
      return { ok: false, detail: `porta HTTP ${port} diverge da resposta UDP (${candidate.httpPort})` }
    }
    const lanHost = typeof body?.lan?.host === 'string' ? body.lan.host.trim() : ''
    if (lanHost && lanHost !== candidate.host) {
      return { ok: false, detail: 'host HTTP diverge da resposta UDP' }
    }
    const loginUrl = body?.lan?.loginUrl || body?.client?.recommendedStartUrl
    if (typeof loginUrl !== 'string' || !loginUrl.startsWith('http')) {
      return { ok: false, detail: 'loginUrl ausente no descriptor' }
    }
    let loginOrigin
    try {
      loginOrigin = new URL(loginUrl).origin
    } catch {
      return { ok: false, detail: 'loginUrl inválida no descriptor' }
    }
    if (loginOrigin !== candidate.origin) {
      return { ok: false, detail: 'endpoint HTTP não corresponde ao anunciado via UDP' }
    }
    return { ok: true, loginUrl, connection: body }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { ok: false, detail: msg }
  } finally {
    clearTimeout(t)
  }
}

/**
 * @param {{ udpPort?: number, attempts?: number, timeoutMs?: number }} [opts]
 */
export async function discoverOmpsLanServers(opts = {}) {
  const udpPort = opts.udpPort ?? OMPS_LAN_DISCOVERY_UDP_PORT
  const attempts = opts.attempts ?? 3
  const timeoutMs = opts.timeoutMs ?? 2_500
  const requestPayload = buildOmpsLanDiscoveryRequestBuffer()

  /** @type {Map<string, ReturnType<typeof parseOmpsLanDiscoveryResponse> extends { ok: true, value: infer V } ? V : never>} */
  const byInstance = new Map()

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      const targets = listBroadcastTargets()
      const timer = setTimeout(() => {
        socket.close(() => resolve(undefined))
      }, timeoutMs)

      socket.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg.toString('utf8'))
          const response = parseOmpsLanDiscoveryResponse(parsed)
          if (!response.ok) return
          byInstance.set(response.value.instanceId, response.value)
        } catch {
          // ignore
        }
      })

      socket.bind(0, () => {
        socket.setBroadcast(true)
        for (const target of targets) {
          socket.send(requestPayload, udpPort, target, () => {})
        }
      })
    })
    if (byInstance.size > 0) break
  }

  const candidates = [...byInstance.values()]
  const verified = []
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const http = await validateServerConnection(candidate.serverConnectionUrl, 4_000, candidate)
    if (http.ok) {
      verified.push({
        ...candidate,
        loginUrl: http.loginUrl,
        connection: http.connection,
      })
    }
  }

  return {
    servers: verified,
    ambiguous: verified.length > 1,
    detail:
      verified.length === 0
        ? 'Nenhum Servidor OMPS respondeu na rede local (UDP + HTTP).'
        : verified.length === 1
          ? `Servidor encontrado: ${verified[0].displayName} em ${verified[0].loginUrl}`
          : `${verified.length} servidores OMPS encontrados na rede.`,
  }
}
