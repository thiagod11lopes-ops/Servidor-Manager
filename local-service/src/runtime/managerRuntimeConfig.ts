/** Portas padrão da instalação (genérica e OMPS em produção). */
export const DEFAULT_SERVICE_PORT = 47831
export const DEFAULT_UI_PORT = 5199

/** Portas sugeridas para build descompactada de teste (somente via launcher isolado). */
export const ISOLATED_TEST_DEFAULT_SERVICE_PORT = 47832
export const ISOLATED_TEST_DEFAULT_UI_PORT = 5200

const DEV_UI_PORTS = [5173, 4173] as const

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback
  return n
}

export function parseServicePort(env: NodeJS.ProcessEnv = process.env): number {
  return parsePort(env.SERVIDOR_MANAGER_SERVICE_PORT, DEFAULT_SERVICE_PORT)
}

export function parseManagerUiPort(env: NodeJS.ProcessEnv = process.env): number {
  return parsePort(env.SM_UI_PORT, DEFAULT_UI_PORT)
}

export function getKnownManagerUiPorts(env: NodeJS.ProcessEnv = process.env): number[] {
  const ui = parseManagerUiPort(env)
  const set = new Set<number>([...DEV_UI_PORTS, DEFAULT_UI_PORT, ui])
  return [...set].sort((a, b) => a - b)
}

export function buildAllowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const origins = new Set<string>()
  for (const port of getKnownManagerUiPorts(env)) {
    origins.add(`http://localhost:${port}`)
    origins.add(`http://127.0.0.1:${port}`)
  }
  return origins
}

export function getManagerUiPortForLanLinks(env: NodeJS.ProcessEnv = process.env): number {
  return parseManagerUiPort(env)
}
