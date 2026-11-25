import dgram from 'node:dgram'
import {
  OMPS_LAN_DISCOVERY_UDP_PORT,
  buildOmpsLanDiscoveryResponseBuffer,
  parseOmpsLanDiscoveryRequest,
} from './ompsLanDiscoveryProtocol.ts'

export type OmpsLanDiscoveryAdvertisement = {
  host: string
  httpPort: number
  entryPath: string
  instanceId: string
  displayName: string
}

type ActiveServer = {
  socket: dgram.Socket
  port: number
  getAdvertisement: () => OmpsLanDiscoveryAdvertisement | null
}

const activeBySystem = new Map<string, ActiveServer>()

function parseRequestMessage(msg: Buffer): unknown {
  try {
    return JSON.parse(msg.toString('utf8'))
  } catch {
    return null
  }
}

export async function startOmpsLanDiscoveryServer(input: {
  systemId: string
  udpPort?: number
  getAdvertisement: () => OmpsLanDiscoveryAdvertisement | null
}): Promise<{ ok: true } | { ok: false; message: string }> {
  await stopOmpsLanDiscoveryServer(input.systemId)

  const port = input.udpPort ?? OMPS_LAN_DISCOVERY_UDP_PORT
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

  const bindPromise = new Promise<void>((resolve, reject) => {
    socket.once('error', reject)
    socket.bind(port, '0.0.0.0', () => {
      socket.removeListener('error', reject)
      resolve()
    })
  })

  socket.on('message', (msg, rinfo) => {
    const parsed = parseRequestMessage(msg)
    const req = parseOmpsLanDiscoveryRequest(parsed)
    if (!req.ok) return
    const ad = input.getAdvertisement()
    if (!ad) return
    const payload = buildOmpsLanDiscoveryResponseBuffer({
      host: ad.host,
      httpPort: ad.httpPort,
      entryPath: ad.entryPath,
      instanceId: ad.instanceId,
      displayName: ad.displayName,
    })
    socket.send(payload, rinfo.port, rinfo.address, () => {})
  })

  try {
    await bindPromise
  } catch (error) {
    socket.close()
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `Não foi possível escutar descoberta UDP na porta ${port}: ${detail}` }
  }

  activeBySystem.set(input.systemId, { socket, port, getAdvertisement: input.getAdvertisement })
  return { ok: true }
}

export async function stopOmpsLanDiscoveryServer(systemId: string): Promise<void> {
  const active = activeBySystem.get(systemId)
  if (!active) return
  activeBySystem.delete(systemId)
  await new Promise<void>((resolve) => {
    active.socket.close(() => resolve())
  })
}

export function isOmpsLanDiscoveryServerRunning(systemId: string): boolean {
  return activeBySystem.has(systemId)
}
