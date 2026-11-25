/** Saída de Caddy/Docker/Node/PowerShell indicando conflito de bind TCP ou porta ocupada. */
export function detectPortBindConflict(output: string): boolean {
  return isRecoverableLanHttpPortFailure(output)
}

/**
 * Falhas em que outra porta HTTP LAN pode resolver (não inclui config inválida, dist ausente, etc.).
 */
export function isRecoverableLanHttpPortFailure(output: string): boolean {
  const text = output.toLowerCase()
  if (
    /address already in use/.test(text) ||
    /only one usage of each socket address/.test(text) ||
    (/bind:\s/.test(text) && /in use|already allocated|forbidden/.test(text)) ||
    /failed to bind|listen tcp.*bind/.test(text) ||
    /port is already allocated/.test(text) ||
    /failed to listen|error listening/.test(text) ||
    /bind: permission denied/.test(text)
  ) {
    return true
  }
  // start-servidor-lan.ps1 / mensagens Manager (PT)
  if (/porta\s+\d+\s+j[aá]\s+est[aá]\s+em\s+uso/.test(text)) return true
  if (/j[aá]\s+est[aá]\s+em\s+uso\s+pelo\s+processo/.test(text)) return true
  if (/administrativa\s+2019\s+j[aá]\s+est[aá]\s+em\s+uso/.test(text)) return true
  // Linux / Caddy comum
  if (/listen tcp :?\d+: bind/.test(text)) return true
  return false
}
