import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { getSystemsRoot } from '../installation/paths.ts'
import { readOmpsSystemPortsRecord, writeOmpsSystemHttpPort } from './ompsSystemPorts.ts'
import { resolveServidorEnvPaths, setEnvLine } from './prepareServidorEnv.ts'
import type { ServerManifest } from './types.ts'
import {
  formatFixedLanPortBlockedMessage,
  loadActiveServidorOmpsFixedLanPolicy,
  resolveOmpsProductLanHost,
  verifyExpectedLanHostOnMachine,
  type ServidorOmpsFixedLanPolicy,
} from '../products/servidorOmpsFixedLanRuntime.ts'
import {
  getManagerInstallRoot,
} from '../bundledOmps/managerInstallRoot.ts'
import {
  isAllowedOmpsHttpPort,
  isServidorOmpsProduct,
  normalizeServidorOmpsLanAccess,
  readServidorOmpsProductConfigFromInstallRoot,
  resolveOmpsHttpPortScanMaxOffset,
  type ServidorOmpsLanAccess,
} from '../products/servidorOmpsProductConfig.ts'
import { probeLocalHttpUrl } from '../network/probeLocalHttpUrl.ts'
import {
  buildFixedLanPort8080BlockedMessage,
  diagnoseFixedLanPort8080Conflict,
  type FixedLanPort8080ConflictDetails,
} from './fixedLanPort8080Conflict.ts'

/** Faixa base..base+maxOffset-1 (ex.: 8080–8099). */
export const LAN_HTTP_PORT_SCAN_MAX = 20

const PORT_RESERVATION_STATUSES = new Set([
  'installed-lan',
  'phases-through-build-ok',
  'phases-failed',
])

export function isLoopbackTcpPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (open: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(1500)
    socket.on('connect', () => done(true))
    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
  })
}

let loopbackTcpPortOpenOverride: ((port: number, host?: string) => Promise<boolean>) | null = null

/** Hook de teste — restaurar com `setLoopbackTcpPortOpenOverrideForTests(null)`. */
export function setLoopbackTcpPortOpenOverrideForTests(
  override: ((port: number, host?: string) => Promise<boolean>) | null,
): void {
  loopbackTcpPortOpenOverride = override
}

async function probeLoopbackTcpPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  if (loopbackTcpPortOpenOverride) return loopbackTcpPortOpenOverride(port, host)
  return isLoopbackTcpPortOpen(port, host)
}

export function buildLanHttpPortScanOrder(
  base: number,
  maxOffset: number,
  recordedPort?: number | null,
): number[] {
  const order: number[] = []
  const seen = new Set<number>()
  const push = (port: number) => {
    if (port < 1 || port > 65535 || seen.has(port)) return
    seen.add(port)
    order.push(port)
  }
  if (recordedPort != null) push(recordedPort)
  for (let offset = 0; offset < maxOffset; offset += 1) {
    push(base + offset)
  }
  return order
}

/**
 * Escolhe porta HTTP LAN sem encerrar processos alheios.
 * `listeningPorts` = probe 127.0.0.1; `claimsByPort` = systemIds Manager (excl. excludeSystemId já aplicado).
 */
export function selectLanHttpPortFromScan(input: {
  candidates: number[]
  listeningPorts: Set<number>
  claimsByPort: Map<number, string[]>
  recordedPortForSystem?: number | null
}): { port: number } | { error: string } {
  for (const candidate of input.candidates) {
    const otherClaims = input.claimsByPort.get(candidate) ?? []
    if (otherClaims.length > 0) continue

    const listening = input.listeningPorts.has(candidate)
    if (listening) {
      const isOwnRecorded =
        input.recordedPortForSystem != null && candidate === input.recordedPortForSystem
      if (!isOwnRecorded) continue
    }

    return { port: candidate }
  }
  const first = input.candidates[0]
  const last = input.candidates[input.candidates.length - 1]
  return {
    error: `Nenhuma porta HTTP LAN livre entre ${first} e ${last} (registry Manager + probe local).`,
  }
}

async function readHttpPortFromServidorEnv(envPath: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    const match = raw.match(/^\s*ACOMOPMS_HTTP_PORT\s*=\s*(\d+)/m)
    return match ? Number.parseInt(match[1], 10) : null
  } catch {
    return null
  }
}

async function readHttpPortFromState(statePath: string): Promise<number | null> {
  try {
    const raw = JSON.parse(await fs.readFile(statePath, 'utf8')) as {
      servidorEnv?: { httpPort?: number }
    }
    const port = raw.servidorEnv?.httpPort
    return typeof port === 'number' ? port : null
  } catch {
    return null
  }
}

export async function collectManagerLanHttpPortClaims(
  excludeSystemId?: string,
): Promise<Map<number, string[]>> {
  const claims = new Map<number, string[]>()
  const root = getSystemsRoot()
  let entries: string[] = []
  try {
    entries = await fs.readdir(root)
  } catch {
    return claims
  }

  for (const entry of entries) {
    if (excludeSystemId && entry === excludeSystemId) continue
    const statePath = path.join(root, entry, 'server-manifest-state.json')
    let status: string | null = null
    try {
      const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as { status?: string }
      status = state.status ?? null
    } catch {
      continue
    }
    if (!status || !PORT_RESERVATION_STATUSES.has(status)) continue

    const recorded = await readOmpsSystemPortsRecord(entry)
    const projectDir = path.join(root, entry, 'project')
    const envPath = path.join(projectDir, 'Transferir para Servidor', 'servidor-lan', 'servidor.env')
    const port =
      recorded?.httpPort ??
      (await readHttpPortFromServidorEnv(envPath)) ??
      (await readHttpPortFromState(statePath)) ??
      8080
    const list = claims.get(port) ?? []
    list.push(entry)
    claims.set(port, list)
  }
  return claims
}

export type LanHttpPortResolution =
  | { ok: true; httpPort: number; message: string; changed: boolean }
  | { ok: false; message: string; conflict?: FixedLanPort8080ConflictDetails }

async function loadOmpsProductLanForPortGuard(): Promise<ServidorOmpsLanAccess | null> {
  const installRoot = getManagerInstallRoot()
  if (!installRoot) return null
  const config = await readServidorOmpsProductConfigFromInstallRoot(installRoot)
  if (!config || !isServidorOmpsProduct(config)) return null
  return normalizeServidorOmpsLanAccess(config)
}

async function ensureOmpsProductLanHttpPortWithFallback(
  input: {
    systemId: string
    rootDirectory: string
    manifest: ServerManifest
    preferredPort: number
    scanFromPort?: number
  },
  lan: ServidorOmpsLanAccess,
): Promise<LanHttpPortResolution> {
  const hostResolved = await resolveOmpsProductLanHost(lan)
  if (!hostResolved.ok) {
    return { ok: false, message: hostResolved.message }
  }

  const maxOffset = resolveOmpsHttpPortScanMaxOffset(lan)
  const scanBase =
    input.scanFromPort != null && input.scanFromPort > 0 && input.scanFromPort < 65536
      ? input.scanFromPort
      : lan.requiredHttpPort
  const paths = resolveServidorEnvPaths(input.rootDirectory, input.manifest)
  const recorded = await readOmpsSystemPortsRecord(input.systemId)
  const candidates = buildLanHttpPortScanOrder(scanBase, maxOffset, recorded?.httpPort)

  const claims = await collectManagerLanHttpPortClaims(input.systemId)
  const listeningPorts = new Set<number>()
  for (const candidate of candidates) {
    if (await probeLoopbackTcpPortOpen(candidate)) {
      listeningPorts.add(candidate)
    }
  }

  const picked = selectLanHttpPortFromScan({
    candidates,
    listeningPorts,
    claimsByPort: claims,
    recordedPortForSystem: recorded?.httpPort ?? null,
  })
  if ('error' in picked) {
    return {
      ok: false,
      message: [
        `Nenhuma porta HTTP LAN livre para o Servidor OMPS entre ${candidates[0]} e ${candidates[candidates.length - 1]}.`,
        'Libere uma porta na faixa ou encerre o serviço que ocupa o intervalo (sem encerrar processos automaticamente).',
        picked.error,
      ].join(' '),
    }
  }

  const candidate = picked.port
  let content: string
  try {
    content = await fs.readFile(paths.envPath, 'utf8')
  } catch {
    return { ok: false, message: `servidor.env não encontrado: ${paths.relativeEnvPath}` }
  }

  const currentPortMatch = content.match(/^\s*ACOMOPMS_HTTP_PORT\s*=\s*(\d+)/m)
  const currentPort = currentPortMatch ? Number.parseInt(currentPortMatch[1], 10) : lan.requiredHttpPort
  let nextContent = content
  if (currentPort !== candidate) {
    nextContent = setEnvLine(nextContent, 'ACOMOPMS_HTTP_PORT', String(candidate))
  }
  if (lan.lanHostMode === 'auto') {
    nextContent = setEnvLine(nextContent, 'ACOMOPMS_LAN_HOST', 'auto')
  } else if (lan.lanHostMode === 'local') {
    nextContent = setEnvLine(nextContent, 'ACOMOPMS_LAN_HOST', '127.0.0.1')
  } else if (lan.expectedLanHost) {
    nextContent = setEnvLine(nextContent, 'ACOMOPMS_LAN_HOST', lan.expectedLanHost)
  }
  if (nextContent !== content) {
    await fs.writeFile(paths.envPath, nextContent, 'utf8')
  }
  await writeOmpsSystemHttpPort(input.systemId, candidate)

  const changed = currentPort !== candidate
  return {
    ok: true,
    httpPort: candidate,
    changed,
    message: changed
      ? `Servidor OMPS: porta HTTP ajustada para ${candidate} (preferida ${lan.requiredHttpPort}, faixa +${maxOffset - 1}).`
      : `Servidor OMPS: porta HTTP ${candidate} disponível.`,
  }
}

async function ensureFixedProductLanHttpPort(
  input: {
    systemId: string
    rootDirectory: string
    manifest: ServerManifest
  },
  policy: ServidorOmpsFixedLanPolicy,
): Promise<LanHttpPortResolution> {
  const requiredPort = policy.fixed.requiredHttpPort
  const expectedHost = policy.fixed.expectedLanHost

  const hostCheck = verifyExpectedLanHostOnMachine(expectedHost)
  if (!hostCheck.ok) {
    return { ok: false, message: hostCheck.message }
  }

  const claims = await collectManagerLanHttpPortClaims(input.systemId)
  const otherClaims = claims.get(requiredPort) ?? []
  if (otherClaims.length > 0) {
    return {
      ok: false,
      message: formatFixedLanPortBlockedMessage(
        requiredPort,
        `Porta reservada por outra instalação gerenciada: ${otherClaims.join(', ')}.`,
      ),
    }
  }

  const loopbackListening = await probeLoopbackTcpPortOpen(requiredPort)
  const recorded = await readOmpsSystemPortsRecord(input.systemId)
  const ownRecordedPort = recorded?.httpPort ?? null

  if (loopbackListening) {
    const conflict = await diagnoseFixedLanPort8080Conflict({
      systemId: input.systemId,
      rootDirectory: input.rootDirectory,
      requiredPort,
    })

    if (conflict.affinity === 'same_system') {
      // Caddy/proxy desta instalação — reutilizar sem encerrar.
    } else if (conflict.probe.ok && conflict.probe.listening) {
      return {
        ok: false,
        message: buildFixedLanPort8080BlockedMessage(conflict),
        conflict,
      }
    } else {
      return {
        ok: false,
        message: formatFixedLanPortBlockedMessage(
          requiredPort,
          conflict.probe.ok
            ? `A porta ${requiredPort} responde em 127.0.0.1, mas o processo responsável não pôde ser identificado com segurança.`
            : conflict.probe.message,
        ),
        conflict: conflict.probe.ok ? conflict : undefined,
      }
    }
  } else if (ownRecordedPort === requiredPort) {
    // Registro indica 8080, mas nada escuta — seguir alinhando servidor.env.
  }

  const paths = resolveServidorEnvPaths(input.rootDirectory, input.manifest)
  let content: string
  try {
    content = await fs.readFile(paths.envPath, 'utf8')
  } catch {
    return { ok: false, message: `servidor.env não encontrado: ${paths.relativeEnvPath}` }
  }

  const currentPortMatch = content.match(/^\s*ACOMOPMS_HTTP_PORT\s*=\s*(\d+)/m)
  const currentPort = currentPortMatch ? Number.parseInt(currentPortMatch[1], 10) : requiredPort
  const currentHostMatch = content.match(/^\s*ACOMOPMS_LAN_HOST\s*=\s*(.+)$/m)
  const currentHost = currentHostMatch ? currentHostMatch[1].trim() : ''

  let nextContent = content
  if (currentPort !== requiredPort) {
    nextContent = setEnvLine(nextContent, 'ACOMOPMS_HTTP_PORT', String(requiredPort))
  }
  if (currentHost !== expectedHost) {
    nextContent = setEnvLine(nextContent, 'ACOMOPMS_LAN_HOST', expectedHost)
  }
  if (nextContent !== content) {
    await fs.writeFile(paths.envPath, nextContent, 'utf8')
  }

  await writeOmpsSystemHttpPort(input.systemId, requiredPort)

  const changed = currentPort !== requiredPort || currentHost !== expectedHost
  return {
    ok: true,
    httpPort: requiredPort,
    changed,
    message: changed
      ? `Servidor OMPS: servidor.env alinhado a ${expectedHost}:${requiredPort} (rede fixa do produto).`
      : `Servidor OMPS: porta HTTP ${requiredPort} e host ${expectedHost} conforme contrato do produto.`,
  }
}

/**
 * Garante porta HTTP LAN disponível para este systemId (registry Manager + probe OS).
 * Não encerra processos alheios; seleciona 8080, 8081, … na faixa configurável.
 */
export async function ensureLanHttpPortForSystem(input: {
  systemId: string
  rootDirectory: string
  manifest: ServerManifest
  preferredPort: number
  /** Força ordem de varredura a partir desta porta (retentativa pós-falha de bind). */
  scanFromPort?: number
}): Promise<LanHttpPortResolution> {
  const productLan = await loadOmpsProductLanForPortGuard()
  if (productLan) {
    if (productLan.allowHttpPortFallback) {
      return ensureOmpsProductLanHttpPortWithFallback(input, productLan)
    }
    const fixedPolicy = await loadActiveServidorOmpsFixedLanPolicy()
    if (!fixedPolicy) {
      return {
        ok: false,
        message: 'Servidor OMPS: não foi possível validar o host LAN exigido pelo contrato do produto.',
      }
    }
    if (input.scanFromPort != null && input.scanFromPort !== productLan.requiredHttpPort) {
      return {
        ok: false,
        message: formatFixedLanPortBlockedMessage(
          productLan.requiredHttpPort,
          `Tentativa de varredura a partir da porta ${input.scanFromPort} não permitida para este produto.`,
        ),
      }
    }
    return ensureFixedProductLanHttpPort(input, fixedPolicy)
  }

  const base =
    input.scanFromPort != null && input.scanFromPort > 0 && input.scanFromPort < 65536
      ? input.scanFromPort
      : input.preferredPort > 0 && input.preferredPort < 65536
        ? input.preferredPort
        : 8080
  const paths = resolveServidorEnvPaths(input.rootDirectory, input.manifest)
  const recorded = await readOmpsSystemPortsRecord(input.systemId)
  const candidates = buildLanHttpPortScanOrder(base, LAN_HTTP_PORT_SCAN_MAX, recorded?.httpPort)

  const claims = await collectManagerLanHttpPortClaims(input.systemId)
  const listeningPorts = new Set<number>()
  for (const candidate of candidates) {
    if (await probeLoopbackTcpPortOpen(candidate)) {
      listeningPorts.add(candidate)
    }
  }

  const picked = selectLanHttpPortFromScan({
    candidates,
    listeningPorts,
    claimsByPort: claims,
    recordedPortForSystem: recorded?.httpPort ?? null,
  })
  if ('error' in picked) {
    return { ok: false, message: picked.error }
  }

  const candidate = picked.port
  let content: string
  try {
    content = await fs.readFile(paths.envPath, 'utf8')
  } catch {
    return { ok: false, message: `servidor.env não encontrado: ${paths.relativeEnvPath}` }
  }
  const currentMatch = content.match(/^\s*ACOMOPMS_HTTP_PORT\s*=\s*(\d+)/m)
  const current = currentMatch ? Number.parseInt(currentMatch[1], 10) : base
  const changed = current !== candidate
  if (changed) {
    await fs.writeFile(paths.envPath, setEnvLine(content, 'ACOMOPMS_HTTP_PORT', String(candidate)), 'utf8')
  }
  await writeOmpsSystemHttpPort(input.systemId, candidate)

  return {
    ok: true,
    httpPort: candidate,
    changed,
    message: changed
      ? `Porta HTTP LAN ajustada para ${candidate} (faixa a partir de ${base}; ${base} ou anteriores ocupadas por outro serviço ou instalação).`
      : `Porta HTTP LAN ${candidate} disponível.`,
  }
}

/** Mensagem de URL LAN para UI/logs (host pode ser auto/IP). */
export function formatLanHttpAccessHint(lanHost: string, httpPort: number): string {
  const host =
    lanHost === 'auto' ? '<IP-LAN-do-servidor>' : lanHost === '127.0.0.1' ? '127.0.0.1' : lanHost
  return `Acesso HTTP LAN: http://${host}:${httpPort}/ (porta efetiva ACOMOPMS_HTTP_PORT=${httpPort})`
}

/** Detecta porta HTTP OMPS ativa em loopback dentro da faixa do produto. */
export async function resolveActiveOmpsHttpPortOnLoopback(
  lan: ServidorOmpsLanAccess,
  recordedPort?: number | null,
): Promise<number | null> {
  const order = buildLanHttpPortScanOrder(
    lan.requiredHttpPort,
    resolveOmpsHttpPortScanMaxOffset(lan),
    recordedPort ?? null,
  )
  for (const port of order) {
    if (!isAllowedOmpsHttpPort(lan, port)) continue
    const probe = await probeLocalHttpUrl(`http://127.0.0.1:${port}/server-connection.json`, {
      timeoutMs: 1_500,
    })
    if (probe.ok && probe.responded && probe.status >= 200 && probe.status < 500) {
      return port
    }
  }
  return null
}
