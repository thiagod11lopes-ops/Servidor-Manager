import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { getManagerInstallRoot } from '../bundledOmps/managerInstallRoot.ts'

/** Schema do arquivo em resources/servidor-omps-product.json (instalação Servidor OMPS). */
export const SERVIDOR_OMPS_PRODUCT_SCHEMA_V2 = 'servidor-omps-product/2' as const
export const SERVIDOR_OMPS_PRODUCT_SCHEMA_V3 = 'servidor-omps-product/3' as const
export const SERVIDOR_OMPS_FIXED_LAN_SCHEMA_V1 = 'servidor-omps-fixed-lan/1' as const
export const SERVIDOR_OMPS_LAN_SCHEMA_V2 = 'servidor-omps-lan/2' as const
export const OMPS_USUARIO_CLIENT_DEFAULTS_SCHEMA_V1 = 'omps-usuario-client-defaults/1' as const
export const OMPS_USUARIO_CLIENT_DEFAULTS_SCHEMA_V2 = 'omps-usuario-client-defaults/2' as const

export const SERVIDOR_OMPS_PRODUCT_RELATIVE = path.join('resources', 'servidor-omps-product.json')

export type ServidorOmpsLanHostMode = 'auto' | 'fixed' | 'local'

/** Contrato LAN v2 (auto ou IPv4 fixo). */
export type ServidorOmpsLanAccess = {
  schema: typeof SERVIDOR_OMPS_LAN_SCHEMA_V2
  lanHostMode: ServidorOmpsLanHostMode
  /** Obrigatório quando lanHostMode === 'fixed' (local usa 127.0.0.1). */
  expectedLanHost?: string
  requiredHttpPort: number
  /** Faixa [requiredHttpPort, requiredHttpPort + offset) quando allowHttpPortFallback. */
  httpPortScanMaxOffset?: number
  discoveryUdpPort: number
  entryPath: string
  allowHttpPortFallback: boolean
}

/** Legado v1 — somente IPv4 fixo. */
export type ServidorOmpsFixedLanAccess = {
  schema: typeof SERVIDOR_OMPS_FIXED_LAN_SCHEMA_V1
  expectedLanHost: string
  requiredHttpPort: number
  entryPath: string
  allowHttpPortFallback: false
}

export type OmpsUsuarioClientDesktopDefaults = {
  schema: typeof OMPS_USUARIO_CLIENT_DEFAULTS_SCHEMA_V1 | typeof OMPS_USUARIO_CLIENT_DEFAULTS_SCHEMA_V2
  discoverConnection: boolean
  lanDiscovery?: boolean
  windowTitle: string
  startUrlFromFixedLanAccess?: true
  startUrlFromLanAccess?: true
}

export type ServidorOmpsProductConfig = {
  schema: typeof SERVIDOR_OMPS_PRODUCT_SCHEMA_V2 | typeof SERVIDOR_OMPS_PRODUCT_SCHEMA_V3
  productLine: 'servidor-omps'
  displayName: string
  /** v3 */
  lanAccess?: ServidorOmpsLanAccess
  /** v2 legado */
  fixedLanAccess?: ServidorOmpsFixedLanAccess
  clientDesktopDefaults?: OmpsUsuarioClientDesktopDefaults
}

export type ServidorOmpsLanUrls = {
  baseUrl: string
  loginUrl: string
  origin: string
  host: string
  port: number
  discoveryUdpPort: number
  lanHostMode: ServidorOmpsLanHostMode
}

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host.trim())
}

function normalizeEntryPath(entryPath: string): string {
  const trimmed = entryPath.trim()
  if (!trimmed.startsWith('/')) return `/${trimmed}`
  return trimmed
}

export function normalizeServidorOmpsLanAccess(config: ServidorOmpsProductConfig): ServidorOmpsLanAccess {
  if (config.lanAccess) return config.lanAccess
  if (config.fixedLanAccess) {
    return {
      schema: SERVIDOR_OMPS_LAN_SCHEMA_V2,
      lanHostMode: 'fixed',
      expectedLanHost: config.fixedLanAccess.expectedLanHost,
      requiredHttpPort: config.fixedLanAccess.requiredHttpPort,
      discoveryUdpPort: 47_808,
      entryPath: config.fixedLanAccess.entryPath,
      allowHttpPortFallback: false,
    }
  }
  throw new Error('lanAccess ausente no produto OMPS')
}

export function resolveOmpsHttpPortScanMaxOffset(lan: Pick<ServidorOmpsLanAccess, 'httpPortScanMaxOffset'>): number {
  const n = lan.httpPortScanMaxOffset
  if (typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 200) return n
  return 20
}

export function isAllowedOmpsHttpPort(
  lan: Pick<ServidorOmpsLanAccess, 'requiredHttpPort' | 'httpPortScanMaxOffset' | 'allowHttpPortFallback'>,
  httpPort: number,
): boolean {
  if (!Number.isInteger(httpPort) || httpPort <= 0 || httpPort >= 65536) return false
  if (!lan.allowHttpPortFallback) return httpPort === lan.requiredHttpPort
  const maxOffset = resolveOmpsHttpPortScanMaxOffset(lan)
  return httpPort >= lan.requiredHttpPort && httpPort < lan.requiredHttpPort + maxOffset
}

export function buildOmpsLanUrls(
  lan: Pick<
    ServidorOmpsLanAccess,
    'expectedLanHost' | 'requiredHttpPort' | 'entryPath' | 'lanHostMode' | 'discoveryUdpPort' | 'allowHttpPortFallback' | 'httpPortScanMaxOffset'
  >,
  resolvedHost: string,
  effectiveHttpPort?: number,
): ServidorOmpsLanUrls {
  const host = resolvedHost.trim()
  const port = effectiveHttpPort ?? lan.requiredHttpPort
  const entry = normalizeEntryPath(lan.entryPath)
  const baseUrl = `http://${host}:${port}`
  return {
    baseUrl,
    loginUrl: `${baseUrl}${entry}`,
    origin: baseUrl,
    host,
    port,
    discoveryUdpPort: lan.discoveryUdpPort,
    lanHostMode: lan.lanHostMode,
  }
}

/** @deprecated use buildOmpsLanUrls */
export function buildFixedLanUrls(
  fixed: Pick<ServidorOmpsFixedLanAccess, 'expectedLanHost' | 'requiredHttpPort' | 'entryPath'>,
): Omit<ServidorOmpsLanUrls, 'discoveryUdpPort' | 'lanHostMode' | 'host' | 'port'> & { host: string; port: number } {
  const urls = buildOmpsLanUrls(
    {
      schema: SERVIDOR_OMPS_LAN_SCHEMA_V2,
      lanHostMode: 'fixed',
      expectedLanHost: fixed.expectedLanHost,
      requiredHttpPort: fixed.requiredHttpPort,
      discoveryUdpPort: 47_808,
      entryPath: fixed.entryPath,
      allowHttpPortFallback: false,
    },
    fixed.expectedLanHost,
  )
  return urls
}

export function resolveOmpsContractHost(lan: ServidorOmpsLanAccess): string | null {
  if (lan.lanHostMode === 'local') return '127.0.0.1'
  if (lan.lanHostMode === 'fixed') return lan.expectedLanHost?.trim() ?? null
  return null
}

export function resolveOmpsUsuarioDefaultStartUrl(config: ServidorOmpsProductConfig): string | null {
  const lan = normalizeServidorOmpsLanAccess(config)
  if (lan.lanHostMode === 'auto') return null
  const host = resolveOmpsContractHost(lan)
  if (!host) return null
  return buildOmpsLanUrls(lan, host).loginUrl
}

function parseLanAccessV2(
  raw: Record<string, unknown>,
  productSchema: typeof SERVIDOR_OMPS_PRODUCT_SCHEMA_V2 | typeof SERVIDOR_OMPS_PRODUCT_SCHEMA_V3,
): { ok: true; lan: ServidorOmpsLanAccess } | { ok: false; message: string } {
  if (raw.schema !== SERVIDOR_OMPS_LAN_SCHEMA_V2) {
    return { ok: false, message: `lanAccess.schema esperado ${SERVIDOR_OMPS_LAN_SCHEMA_V2}.` }
  }
  const mode = raw.lanHostMode
  if (mode !== 'auto' && mode !== 'fixed' && mode !== 'local') {
    return { ok: false, message: 'lanAccess.lanHostMode deve ser auto, fixed ou local.' }
  }
  const port = raw.requiredHttpPort
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port >= 65536) {
    return { ok: false, message: 'lanAccess.requiredHttpPort inválida.' }
  }
  const udp = raw.discoveryUdpPort
  if (typeof udp !== 'number' || !Number.isInteger(udp) || udp <= 0 || udp >= 65536) {
    return { ok: false, message: 'lanAccess.discoveryUdpPort inválida.' }
  }
  if (typeof raw.entryPath !== 'string' || !raw.entryPath.trim()) {
    return { ok: false, message: 'lanAccess.entryPath ausente.' }
  }
  const fallbackRaw = raw.allowHttpPortFallback
  if (typeof fallbackRaw !== 'boolean') {
    return { ok: false, message: 'lanAccess.allowHttpPortFallback deve ser boolean.' }
  }
  if (mode === 'fixed' && fallbackRaw) {
    return { ok: false, message: 'lanAccess.allowHttpPortFallback deve ser false quando lanHostMode=fixed.' }
  }
  if (
    (mode === 'auto' || mode === 'local') &&
    productSchema === SERVIDOR_OMPS_PRODUCT_SCHEMA_V3 &&
    !fallbackRaw
  ) {
    return {
      ok: false,
      message: `lanAccess.allowHttpPortFallback deve ser true no produto v3 com lanHostMode=${mode}.`,
    }
  }
  if (mode === 'auto' && productSchema === SERVIDOR_OMPS_PRODUCT_SCHEMA_V2 && fallbackRaw) {
    return { ok: false, message: 'lanAccess.allowHttpPortFallback deve ser false no produto v2.' }
  }
  if (mode === 'local' && productSchema === SERVIDOR_OMPS_PRODUCT_SCHEMA_V2 && fallbackRaw) {
    return { ok: false, message: 'lanAccess.allowHttpPortFallback deve ser false no produto v2 com lanHostMode=local.' }
  }
  let httpPortScanMaxOffset: number | undefined
  if (fallbackRaw) {
    const offsetRaw = raw.httpPortScanMaxOffset
    if (offsetRaw == null) {
      httpPortScanMaxOffset = 20
    } else if (typeof offsetRaw !== 'number' || !Number.isInteger(offsetRaw) || offsetRaw <= 0 || offsetRaw > 200) {
      return { ok: false, message: 'lanAccess.httpPortScanMaxOffset inválido (1–200).' }
    } else {
      httpPortScanMaxOffset = offsetRaw
    }
  } else if (raw.httpPortScanMaxOffset != null) {
    return { ok: false, message: 'lanAccess.httpPortScanMaxOffset só se aplica com allowHttpPortFallback=true.' }
  }
  let expectedLanHost: string | undefined
  if (mode === 'fixed') {
    if (typeof raw.expectedLanHost !== 'string' || !isIpv4(raw.expectedLanHost)) {
      return { ok: false, message: 'lanAccess.expectedLanHost deve ser IPv4 quando lanHostMode=fixed.' }
    }
    expectedLanHost = raw.expectedLanHost.trim()
  } else if (mode === 'local') {
    if (raw.expectedLanHost != null && raw.expectedLanHost !== '') {
      return { ok: false, message: 'lanAccess.expectedLanHost não deve ser definido quando lanHostMode=local.' }
    }
  } else if (raw.expectedLanHost != null && raw.expectedLanHost !== '') {
    return { ok: false, message: 'lanAccess.expectedLanHost não deve ser definido quando lanHostMode=auto.' }
  }
  return {
    ok: true,
    lan: {
      schema: SERVIDOR_OMPS_LAN_SCHEMA_V2,
      lanHostMode: mode,
      expectedLanHost,
      requiredHttpPort: port,
      httpPortScanMaxOffset,
      discoveryUdpPort: udp,
      entryPath: normalizeEntryPath(raw.entryPath),
      allowHttpPortFallback: fallbackRaw,
    },
  }
}

function parseFixedLanAccessV1(raw: Record<string, unknown>): { ok: true; fixed: ServidorOmpsFixedLanAccess } | { ok: false; message: string } {
  if (raw.schema !== SERVIDOR_OMPS_FIXED_LAN_SCHEMA_V1) {
    return { ok: false, message: `fixedLanAccess.schema esperado ${SERVIDOR_OMPS_FIXED_LAN_SCHEMA_V1}.` }
  }
  if (typeof raw.expectedLanHost !== 'string' || !isIpv4(raw.expectedLanHost)) {
    return { ok: false, message: 'fixedLanAccess.expectedLanHost deve ser IPv4.' }
  }
  const port = raw.requiredHttpPort
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port >= 65536) {
    return { ok: false, message: 'fixedLanAccess.requiredHttpPort inválida.' }
  }
  if (typeof raw.entryPath !== 'string' || !raw.entryPath.trim()) {
    return { ok: false, message: 'fixedLanAccess.entryPath ausente.' }
  }
  if (raw.allowHttpPortFallback !== false) {
    return { ok: false, message: 'fixedLanAccess.allowHttpPortFallback deve ser false.' }
  }
  return {
    ok: true,
    fixed: {
      schema: SERVIDOR_OMPS_FIXED_LAN_SCHEMA_V1,
      expectedLanHost: raw.expectedLanHost.trim(),
      requiredHttpPort: port,
      entryPath: normalizeEntryPath(raw.entryPath),
      allowHttpPortFallback: false,
    },
  }
}

export function parseServidorOmpsProductConfig(raw: unknown):
  | { ok: true; config: ServidorOmpsProductConfig }
  | { ok: false; message: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: 'servidor-omps-product.json: corpo inválido.' }
  }
  const o = raw as Record<string, unknown>

  const schema = o.schema
  if (schema !== SERVIDOR_OMPS_PRODUCT_SCHEMA_V2 && schema !== SERVIDOR_OMPS_PRODUCT_SCHEMA_V3) {
    return {
      ok: false,
      message: `schema esperado ${SERVIDOR_OMPS_PRODUCT_SCHEMA_V2} ou ${SERVIDOR_OMPS_PRODUCT_SCHEMA_V3}, recebido ${String(schema)}`,
    }
  }
  if (o.productLine !== 'servidor-omps') {
    return { ok: false, message: 'productLine deve ser servidor-omps.' }
  }
  if (typeof o.displayName !== 'string' || !o.displayName.trim()) {
    return { ok: false, message: 'displayName ausente.' }
  }

  let lanAccess: ServidorOmpsLanAccess | undefined
  let fixedLanAccess: ServidorOmpsFixedLanAccess | undefined

  if (o.lanAccess != null) {
    if (typeof o.lanAccess !== 'object') return { ok: false, message: 'lanAccess inválido.' }
    const parsed = parseLanAccessV2(o.lanAccess as Record<string, unknown>, schema as ServidorOmpsProductConfig['schema'])
    if (!parsed.ok) return parsed
    lanAccess = parsed.lan
  } else if (o.fixedLanAccess != null) {
    if (typeof o.fixedLanAccess !== 'object') return { ok: false, message: 'fixedLanAccess inválido.' }
    const parsed = parseFixedLanAccessV1(o.fixedLanAccess as Record<string, unknown>)
    if (!parsed.ok) return parsed
    fixedLanAccess = parsed.fixed
  } else {
    return { ok: false, message: 'lanAccess ou fixedLanAccess ausente.' }
  }

  let clientDesktopDefaults: OmpsUsuarioClientDesktopDefaults | undefined
  if (o.clientDesktopDefaults != null) {
    if (typeof o.clientDesktopDefaults !== 'object') {
      return { ok: false, message: 'clientDesktopDefaults inválido.' }
    }
    const c = o.clientDesktopDefaults as Record<string, unknown>
    const cSchema = c.schema
    if (
      cSchema !== OMPS_USUARIO_CLIENT_DEFAULTS_SCHEMA_V1 &&
      cSchema !== OMPS_USUARIO_CLIENT_DEFAULTS_SCHEMA_V2
    ) {
      return { ok: false, message: 'clientDesktopDefaults.schema inválido.' }
    }
    if (typeof c.discoverConnection !== 'boolean') {
      return { ok: false, message: 'clientDesktopDefaults.discoverConnection deve ser boolean.' }
    }
    if (typeof c.windowTitle !== 'string' || !c.windowTitle.trim()) {
      return { ok: false, message: 'clientDesktopDefaults.windowTitle ausente.' }
    }
    let lanDiscovery: boolean
    if (typeof c.lanDiscovery === 'boolean') {
      lanDiscovery = c.lanDiscovery
    } else {
      lanDiscovery = c.discoverConnection === true
    }
    if (
      cSchema === OMPS_USUARIO_CLIENT_DEFAULTS_SCHEMA_V2 &&
      c.discoverConnection === true &&
      lanDiscovery !== true
    ) {
      return {
        ok: false,
        message: 'clientDesktopDefaults.lanDiscovery deve ser true quando discoverConnection é true.',
      }
    }
    clientDesktopDefaults = {
      schema: cSchema,
      discoverConnection: c.discoverConnection,
      lanDiscovery,
      windowTitle: c.windowTitle.trim(),
      ...(c.startUrlFromFixedLanAccess === true ? { startUrlFromFixedLanAccess: true } : {}),
      ...(c.startUrlFromLanAccess === true ? { startUrlFromLanAccess: true } : {}),
    }
  }

  return {
    ok: true,
    config: {
      schema: schema as ServidorOmpsProductConfig['schema'],
      productLine: 'servidor-omps',
      displayName: o.displayName.trim(),
      lanAccess,
      fixedLanAccess,
      clientDesktopDefaults,
    },
  }
}

/** Produto Servidor OMPS válido (v2/v3). */
export function isServidorOmpsProduct(config: ServidorOmpsProductConfig | null | undefined): config is ServidorOmpsProductConfig {
  if (config == null || config.productLine !== 'servidor-omps') return false
  try {
    normalizeServidorOmpsLanAccess(config)
    return true
  } catch {
    return false
  }
}

export function isStrictOmpsHttpPortProduct(config: ServidorOmpsProductConfig): boolean {
  const lan = normalizeServidorOmpsLanAccess(config)
  return !lan.allowHttpPortFallback
}

/** @deprecated alias — perfil OMPS ativo (inclui fallback de porta). */
export function isServidorOmpsFixedLanProduct(config: ServidorOmpsProductConfig | null | undefined): config is ServidorOmpsProductConfig {
  return isServidorOmpsProduct(config)
}

/** Repositório servidor-manager (dev / testes). */
export function resolveServidorManagerRepoRoot(): string | null {
  const explicit = process.env.SERVIDOR_MANAGER_REPO_ROOT?.trim()
  const seeds = [explicit ? path.resolve(explicit) : null, process.cwd()].filter(
    (value): value is string => Boolean(value),
  )

  for (const start of seeds) {
    let dir = path.resolve(start)
    for (let depth = 0; depth < 10; depth += 1) {
      const pkgPath = path.join(dir, 'package.json')
      try {
        const pkg = JSON.parse(fsSync.readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg.name === 'servidor-manager') return dir
      } catch {
        /* próximo nível */
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

function appendUniqueCandidate(candidates: string[], filePath: string | null | undefined): void {
  if (!filePath?.trim()) return
  const resolved = path.resolve(filePath.trim())
  if (!candidates.includes(resolved)) candidates.push(resolved)
}

/** Caminhos possíveis do contrato OMPS (instalação, dev, fallback empacotado). */
export function listServidorOmpsProductConfigFileCandidates(): string[] {
  const candidates: string[] = []
  const installRoot = getManagerInstallRoot()
  if (installRoot) {
    appendUniqueCandidate(candidates, path.join(installRoot, SERVIDOR_OMPS_PRODUCT_RELATIVE))
  }
  const resourcesPath = process.env.SM_RESOURCES_PATH?.trim()
  if (resourcesPath) {
    appendUniqueCandidate(candidates, path.join(resourcesPath, 'servidor-omps-product.json'))
  }

  const repoRoot = resolveServidorManagerRepoRoot()
  if (repoRoot) {
    appendUniqueCandidate(
      candidates,
      path.join(repoRoot, 'resources-packaging', 'servidor-omps-product.json'),
    )
    appendUniqueCandidate(
      candidates,
      path.join(repoRoot, 'release', 'servidor-omps', 'win-unpacked', 'resources', 'servidor-omps-product.json'),
    )
  }

  const entry = process.argv[1]
  if (entry) {
    const entryDir = path.dirname(path.resolve(entry))
    appendUniqueCandidate(
      candidates,
      path.join(entryDir, 'servidor-omps-product.fallback.json'),
    )
    appendUniqueCandidate(
      candidates,
      path.join(entryDir, '..', 'servidor-omps-product.fallback.json'),
    )
  }

  return candidates
}

export async function readServidorOmpsProductConfigFromFile(
  filePath: string,
): Promise<ServidorOmpsProductConfig | null> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown
    const parsed = parseServidorOmpsProductConfig(raw)
    return parsed.ok ? parsed.config : null
  } catch {
    return null
  }
}

/** Lê o contrato ativo do Servidor OMPS (várias origens — evita falha quando INSTALL_ROOT aponta ao Manager genérico). */
export async function readActiveServidorOmpsProductConfig(): Promise<ServidorOmpsProductConfig | null> {
  for (const filePath of listServidorOmpsProductConfigFileCandidates()) {
    const config = await readServidorOmpsProductConfigFromFile(filePath)
    if (config) return config
  }
  return null
}

export async function readServidorOmpsProductConfigFromInstallRoot(
  installRoot: string,
): Promise<ServidorOmpsProductConfig | null> {
  return readServidorOmpsProductConfigFromFile(path.join(installRoot, SERVIDOR_OMPS_PRODUCT_RELATIVE))
}
