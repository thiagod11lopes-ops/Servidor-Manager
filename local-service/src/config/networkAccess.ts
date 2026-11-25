import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getManagerConfigDir } from '../installation/managerDataRoot.ts'
import { getKnownManagerUiPorts } from '../runtime/managerRuntimeConfig.ts'

export type NetworkAccessConfig = {
  allowLanAccess: boolean
}

function getNetworkConfigPath(): string {
  return path.join(getManagerConfigDir(), 'network.json')
}

function managerUiPortSet(): Set<string> {
  return new Set(getKnownManagerUiPorts().map(String))
}

const APP_PORTS = new Set(['4173', '5173', '3000', '8080'])

export function readNetworkAccessConfig(): NetworkAccessConfig {
  const configPath = getNetworkConfigPath()
  const configDir = path.dirname(configPath)
  try {
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configDir, { recursive: true })
      const defaults: NetworkAccessConfig = { allowLanAccess: true }
      fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf8')
      return defaults
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as NetworkAccessConfig
    return { allowLanAccess: parsed.allowLanAccess !== false }
  } catch {
    return { allowLanAccess: true }
  }
}

export function getAppBindHost(): string {
  return readNetworkAccessConfig().allowLanAccess ? '0.0.0.0' : '127.0.0.1'
}

/** RFC 6598 — CGNAT / faixa operadora (100.64.0.0/10); não usar como IPv4 LAN anunciável. */
export function isCarrierGradeNatIPv4(hostname: string): boolean {
  const m = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname)
  if (!m) return false
  const second = Number(m[1])
  return second >= 64 && second <= 127
}

/** Nomes de interface a ignorar na seleção de IPv4 LAN (VPN/virtual). Inclui o adaptador Windows com nome “Tailscale”. */
const VIRTUAL_INTERFACE_NAME =
  /tailscale|vethernet|wsl|virtualbox|vmware|hyper-v|loopback|bluetooth|teredo|isatap|npcap|wireguard|conexão local|local area connection\*|local area connection 2\*/i

type NetworkInterfaceDict = NodeJS.Dict<os.NetworkInterfaceInfo[]>

let networkInterfacesProvider: () => NetworkInterfaceDict = () => os.networkInterfaces()

/** Hook de teste — restaurar com `setNetworkInterfacesProviderForTests(null)`. */
export function setNetworkInterfacesProviderForTests(provider: (() => NetworkInterfaceDict) | null): void {
  networkInterfacesProvider = provider ?? (() => os.networkInterfaces())
}

function readNetworkInterfacesSafely():
  | { ok: true; ifaces: NetworkInterfaceDict }
  | { ok: false; error: string } {
  try {
    const ifaces = networkInterfacesProvider()
    return { ok: true, ifaces: ifaces ?? {} }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: detail }
  }
}

function ipv4AddressesOnLocalMachine(ifaces: NetworkInterfaceDict): string[] {
  const addresses: string[] = []
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue
    for (const entry of entries) {
      const family = entry.family
      const isV4 = family === 'IPv4' || family === 4
      if (isV4) addresses.push(entry.address)
    }
  }
  return addresses
}

export type LocalIpv4AssignmentCheck =
  | { ok: true }
  | { ok: false; reason: 'not_assigned' | 'interfaces_unavailable'; message: string }

/**
 * Confirma que o IPv4 está atribuído a uma interface local (não rota remota, gateway ou outro host).
 */
export function checkIpv4AssignedOnLocalMachine(targetIpv4: string): LocalIpv4AssignmentCheck {
  const target = targetIpv4.trim()
  const read = readNetworkInterfacesSafely()
  if (!read.ok) {
    return {
      ok: false,
      reason: 'interfaces_unavailable',
      message: `Não foi possível consultar as interfaces de rede desta máquina (${read.error}). A validação do IP obrigatório do Servidor OMPS foi abortada por segurança.`,
    }
  }

  for (const address of ipv4AddressesOnLocalMachine(read.ifaces)) {
    if (address === target) return { ok: true }
  }

  return {
    ok: false,
    reason: 'not_assigned',
    message: `IPv4 ${target} não está atribuído a nenhuma interface local.`,
  }
}

/** Verifica se o IPv4 está atribuído a alguma interface local (Windows/Linux). */
export function isIpv4AssignedOnLocalMachine(targetIpv4: string): boolean {
  const check = checkIpv4AssignedOnLocalMachine(targetIpv4)
  return check.ok
}

export function isRfc1918IPv4(address: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(address)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)) return true
  const m = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(address)
  if (m) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return true
  }
  return false
}

function lanCandidateScore(interfaceName: string, address: string): number | null {
  if (VIRTUAL_INTERFACE_NAME.test(interfaceName)) return null
  if (isCarrierGradeNatIPv4(address)) return null
  if (address.startsWith('169.254.')) return null
  if (isRfc1918IPv4(address)) {
    if (address.startsWith('192.168.')) return 300
    if (address.startsWith('10.')) return 200
    return 100
  }
  return 10
}

/**
 * IPv4 da LAN física (RFC1918 preferido), ignorando CGNAT e interfaces virtuais.
 */
export type PhysicalLanIPv4Candidate = {
  address: string
  interfaceName: string
  score: number
}

/** Candidatos ordenados (maior score primeiro) para modo rede local. */
export function listPhysicalLanIPv4Candidates(): PhysicalLanIPv4Candidate[] {
  const read = readNetworkInterfacesSafely()
  const nets = read.ok ? read.ifaces : {}
  const candidates: PhysicalLanIPv4Candidate[] = []

  for (const name of Object.keys(nets)) {
    const entries = nets[name]
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      const score = lanCandidateScore(name, entry.address)
      if (score === null) continue
      candidates.push({ address: entry.address, interfaceName: name, score })
    }
  }

  candidates.sort(
    (a, b) => b.score - a.score || a.interfaceName.localeCompare(b.interfaceName) || a.address.localeCompare(b.address),
  )
  return candidates
}

export type PhysicalLanIPv4Selection = {
  address: string | null
  candidates: PhysicalLanIPv4Candidate[]
  /** Várias interfaces empatadas no topo — IPv4 escolhido, mas vale conferir manualmente. */
  ambiguous: boolean
  note?: string
}

export function selectPhysicalLanIPv4(): PhysicalLanIPv4Selection {
  const candidates = listPhysicalLanIPv4Candidates()
  if (candidates.length === 0) {
    return {
      address: null,
      candidates,
      ambiguous: false,
      note: 'Nenhuma interface IPv4 adequada (Wi‑Fi/Ethernet RFC1918). Informe ACOMOPMS_LAN_HOST manualmente ou conecte-se à rede local.',
    }
  }

  const topScore = candidates[0].score
  const topTier = candidates.filter((c) => c.score === topScore)
  const chosen = topTier[0]
  const ambiguous = topTier.length > 1
  const note = ambiguous
    ? `Várias interfaces LAN (${topTier.map((c) => `${c.interfaceName}=${c.address}`).join(', ')}); usando ${chosen.interfaceName} (${chosen.address}).`
    : `Interface ${chosen.interfaceName} (${chosen.address}).`

  return { address: chosen.address, candidates, ambiguous, note }
}

export function getPhysicalLanIPv4(): string | null {
  return selectPhysicalLanIPv4().address
}

/** IPv4 utilizável na LAN (preferência por interface física / RFC1918). */
export function getPrimaryLanIPv4(): string | null {
  const physical = getPhysicalLanIPv4()
  if (physical) return physical

  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    const entries = nets[name]
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      if (entry.address.startsWith('169.254.')) continue
      if (isCarrierGradeNatIPv4(entry.address)) continue
      if (VIRTUAL_INTERFACE_NAME.test(name)) continue
      return entry.address
    }
  }
  return null
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower === '127.0.0.1') return true
  if (lower.endsWith('.ts.net')) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  const m = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(hostname)
  if (m) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return true
  }
  if (hostname === os.hostname().toLowerCase()) return true
  return false
}

export function isOriginAllowedForLanManager(origin: string): boolean {
  if (!readNetworkAccessConfig().allowLanAccess) return false
  try {
    const url = new URL(origin)
    const port = url.port || (url.protocol === 'https:' ? '443' : '80')
    if (!managerUiPortSet().has(port) && !APP_PORTS.has(port)) return false
    return isPrivateOrLocalHost(url.hostname)
  } catch {
    return false
  }
}

export function buildLanAccessUrl(port: number | null, pathSuffix = '/'): string | null {
  if (!port || !readNetworkAccessConfig().allowLanAccess) return null
  const physical = getPhysicalLanIPv4()
  const ip =
    physical && isRfc1918IPv4(physical)
      ? physical
      : (() => {
          const primary = getPrimaryLanIPv4()
          return primary && isRfc1918IPv4(primary) ? primary : physical ?? primary
        })()
  if (!ip || isCarrierGradeNatIPv4(ip)) return null
  const suffix = pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`
  return `http://${ip}:${port}${suffix}`
}
