/**
 * @param {unknown} error
 * @param {{ timedOut?: boolean, host?: string, port?: number }} [opts]
 */
export function classifyFetchError(error, opts = {}) {
  const host = opts.host ?? 'servidor'
  const port = opts.port ?? 8080
  if (opts.timedOut) {
    return `Tempo esgotado ao contactar ${host}:${port}. Verifique se o Servidor OMPS está ativo e se o firewall permite HTTP ${port}.`
  }
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  if (lower.includes('abort') || lower.includes('aborted')) {
    return `Tempo esgotado ao contactar ${host}:${port}. Verifique se o Servidor OMPS está ativo e se o firewall permite HTTP ${port}.`
  }
  if (lower.includes('econnrefused') || lower.includes('connection refused')) {
    return `Conexão recusada em ${host}:${port} — nenhum serviço HTTP respondeu. Inicie o Servidor OMPS ou confira se Caddy está escutando.`
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return `Endereço ${host} não pôde ser alcançado nesta rede.`
  }
  if (lower.includes('ehostunreach') || lower.includes('network unreachable')) {
    return `Rede inacessível ao tentar alcançar ${host}:${port}. Verifique cabo/Wi‑Fi.`
  }
  if (lower.includes('etimedout')) {
    return `Tempo esgotado na rede ao alcançar ${host}:${port} (firewall ou servidor sem resposta).`
  }
  return message
}
