/** Guard compartilhado: proxy UI (:5199) e testes — rotas só via loopback. */

export function isLoopbackRemoteAddress(remoteAddress) {
  if (!remoteAddress || typeof remoteAddress !== 'string') return false
  if (remoteAddress === '127.0.0.1' || remoteAddress === '::1') return true
  if (remoteAddress.startsWith('::ffff:127.0.0.1')) return true
  return false
}

export function isRemoteValidationProxyPath(pathname) {
  return /^\/api\/v1\/systems\/[^/]+\/remote-validation\//.test(pathname)
}

export function isLocalhostOnlyProxyPath(pathname) {
  return isRemoteValidationProxyPath(pathname)
}

export function localhostOnlyForbiddenJsonBody() {
  return JSON.stringify({ ok: false, error: 'FORBIDDEN' })
}
