/** Porta UDP fixa de descoberta LAN OMPS (documentada no produto). */
export const OMPS_LAN_DISCOVERY_UDP_PORT = 47_808

export const OMPS_LAN_DISCOVERY_MAGIC = 'OMPS-DISC'
export const OMPS_LAN_DISCOVERY_REQUEST_SCHEMA = 'omps-lan-discovery-request/1'
export const OMPS_LAN_DISCOVERY_RESPONSE_SCHEMA = 'omps-lan-discovery-response/1'
export const OMPS_LAN_DISCOVERY_PROTOCOL_VERSION = 1

export function parseOmpsLanDiscoveryRequest(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, message: 'corpo inválido' }
  const o = payload
  if (o.schema !== OMPS_LAN_DISCOVERY_REQUEST_SCHEMA) return { ok: false, message: 'schema de pedido inválido' }
  if (o.magic !== OMPS_LAN_DISCOVERY_MAGIC) return { ok: false, message: 'magic inválido' }
  return { ok: true }
}

export function parseOmpsLanDiscoveryResponse(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, message: 'corpo inválido' }
  const o = payload
  if (o.schema !== OMPS_LAN_DISCOVERY_RESPONSE_SCHEMA) {
    return { ok: false, message: 'schema de resposta inválido' }
  }
  if (o.magic !== OMPS_LAN_DISCOVERY_MAGIC) return { ok: false, message: 'magic inválido' }
  if (o.protocolVersion !== OMPS_LAN_DISCOVERY_PROTOCOL_VERSION) {
    return { ok: false, message: 'versão de protocolo incompatível' }
  }
  const host = typeof o.host === 'string' ? o.host.trim() : ''
  const httpPort = typeof o.httpPort === 'number' ? o.httpPort : Number.parseInt(String(o.httpPort ?? ''), 10)
  const entryPath = typeof o.entryPath === 'string' ? o.entryPath.trim() : '/login'
  const instanceId = typeof o.instanceId === 'string' ? o.instanceId.trim() : ''
  if (!host || !Number.isInteger(httpPort) || httpPort <= 0) {
    return { ok: false, message: 'host/porta inválidos na resposta' }
  }
  if (!instanceId) return { ok: false, message: 'instanceId ausente' }
  const normalizedEntry = entryPath.startsWith('/') ? entryPath : `/${entryPath}`
  const origin = `http://${host}:${httpPort}`
  return {
    ok: true,
    value: {
      host,
      httpPort,
      entryPath: normalizedEntry,
      instanceId,
      displayName: typeof o.displayName === 'string' ? o.displayName.trim() : 'Servidor OMPS',
      origin,
      loginUrl: `${origin}${normalizedEntry}`,
      serverConnectionUrl: `${origin}/server-connection.json`,
    },
  }
}

export function buildOmpsLanDiscoveryRequestBuffer() {
  return Buffer.from(
    JSON.stringify({
      schema: OMPS_LAN_DISCOVERY_REQUEST_SCHEMA,
      magic: OMPS_LAN_DISCOVERY_MAGIC,
      protocolVersion: OMPS_LAN_DISCOVERY_PROTOCOL_VERSION,
    }),
    'utf8',
  )
}
