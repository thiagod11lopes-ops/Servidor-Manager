export const SERVER_CONNECTION_SCHEMA = 'acomopms-server-connection/1' as const

export type ServerConnectionLanBlock = {
  host?: unknown
  httpPort?: unknown
  origin?: unknown
  loginUrl?: unknown
}

export function validateServerConnectionForFixedLanContract(
  payload: unknown,
  expected: { host: string; port: number },
): { ok: true; loginUrl: string; origin: string } | { ok: false; message: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'server-connection.json: corpo inválido.' }
  }
  const doc = payload as Record<string, unknown>
  if (doc.schema !== SERVER_CONNECTION_SCHEMA) {
    return {
      ok: false,
      message: `server-connection.json: schema esperado ${SERVER_CONNECTION_SCHEMA}, recebido ${String(doc.schema)}.`,
    }
  }

  const lan = doc.lan as ServerConnectionLanBlock | undefined
  if (!lan || typeof lan !== 'object') {
    return { ok: false, message: 'server-connection.json: bloco lan ausente.' }
  }

  const host = typeof lan.host === 'string' ? lan.host.trim() : ''
  const httpPort = typeof lan.httpPort === 'number' ? lan.httpPort : Number.parseInt(String(lan.httpPort ?? ''), 10)
  const origin = typeof lan.origin === 'string' ? lan.origin.trim().replace(/\/+$/, '') : ''
  const loginUrl = typeof lan.loginUrl === 'string' ? lan.loginUrl.trim() : ''

  const expectedOrigin = `http://${expected.host}:${expected.port}`
  const expectedLogin = `${expectedOrigin}/login`

  if (host !== expected.host) {
    return {
      ok: false,
      message: `server-connection.json: lan.host=${host || '?'} diverge do contrato (${expected.host}).`,
    }
  }
  if (httpPort !== expected.port) {
    return {
      ok: false,
      message: `server-connection.json: lan.httpPort=${httpPort} diverge do contrato (${expected.port}).`,
    }
  }
  if (origin !== expectedOrigin) {
    return {
      ok: false,
      message: `server-connection.json: lan.origin=${origin || '?'} diverge do contrato (${expectedOrigin}).`,
    }
  }
  if (loginUrl !== expectedLogin) {
    return {
      ok: false,
      message: `server-connection.json: lan.loginUrl diverge do contrato (${expectedLogin}).`,
    }
  }

  return { ok: true, loginUrl, origin }
}
