import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getSystemRoot } from '../installation/paths.ts'
import { formatFixedLanPortBlockedMessage } from '../products/servidorOmpsFixedLanRuntime.ts'
import {
  probeTcpPortListeners,
  type TcpPortListenerIdentity,
  type TcpPortListenerProbeResult,
} from './lanTcpPortListenerProbe.ts'

export const FIXED_LAN_HTTP_PORT_CONFLICT_CODE = 'FIXED_LAN_HTTP_PORT_CONFLICT' as const

/** Payload reduzido para API/UI (Meus Sistemas → Iniciar). */
export type FixedLanPort8080ConflictApiSnapshot = {
  code: typeof FIXED_LAN_HTTP_PORT_CONFLICT_CODE
  requiredPort: number
  primaryListener: TcpPortListenerIdentity | null
  affinity: FixedLanListenerAffinity
  releaseAuthorization: FixedLanPort8080ReleaseAuthorization | null
  manualSteps: string[]
}

export function toFixedLanPort8080ConflictApiSnapshot(
  details: FixedLanPort8080ConflictDetails,
): FixedLanPort8080ConflictApiSnapshot {
  return {
    code: details.code,
    requiredPort: details.requiredPort,
    primaryListener: details.primaryListener,
    affinity: details.affinity,
    releaseAuthorization: details.releaseAuthorization,
    manualSteps: details.manualSteps,
  }
}

export type FixedLanListenerAffinity = 'same_system' | 'other_omps' | 'foreign' | 'unknown'

export type FixedLanPort8080ConflictDetails = {
  code: typeof FIXED_LAN_HTTP_PORT_CONFLICT_CODE
  requiredPort: number
  probe: TcpPortListenerProbeResult
  primaryListener: TcpPortListenerIdentity | null
  affinity: FixedLanListenerAffinity
  releaseAuthorization: FixedLanPort8080ReleaseAuthorization | null
  manualSteps: string[]
}

export type FixedLanPort8080ReleaseAuthorization = {
  version: 1
  actionToken: string
  port: 8080
  issuedAt: string
  listenerFingerprint: string
  listener: TcpPortListenerIdentity
  impactSummary: string
}

const PROTECTED_PROCESS_NAMES = new Set([
  'system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'dwm.exe',
  'fontdrvhost.exe',
  'winlogon.exe',
  'init',
  'systemd',
  'kthreadd',
])

function authorizationPath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'omps-fixed-lan-port-8080-release.json')
}

export function listenerIdentityFingerprint(
  listener: Pick<TcpPortListenerIdentity, 'pid' | 'processName' | 'executablePath'>,
): string {
  const pid = listener.pid ?? 0
  const name = (listener.processName ?? '').toLowerCase()
  const exe = (listener.executablePath ?? '').replace(/\//g, '\\').toLowerCase()
  return `${pid}|${name}|${exe}`
}

export function listenersMatchForRelease(
  expected: Pick<TcpPortListenerIdentity, 'pid' | 'processName' | 'executablePath'>,
  actual: Pick<TcpPortListenerIdentity, 'pid' | 'processName' | 'executablePath'>,
): boolean {
  return listenerIdentityFingerprint(expected) === listenerIdentityFingerprint(actual)
}

export function protectedProcessBlockReason(listener: TcpPortListenerIdentity): string | null {
  if (listener.pid != null && listener.pid <= 4) {
    return 'Processo reservado do sistema operacional.'
  }
  if (listener.identityConfidence === 'unknown' || listener.pid == null || !listener.processName) {
    return 'Identidade do processo inconclusiva — encerramento automático não é oferecido.'
  }
  const name = listener.processName.toLowerCase()
  if (PROTECTED_PROCESS_NAMES.has(name)) {
    return `Processo protegido (${listener.processName}) — encerramento não é oferecido pelo Manager.`
  }
  return null
}

export function evaluateListenerOmpsAffinity(
  listener: TcpPortListenerIdentity,
  ctx: { systemId: string; rootDirectory: string },
): FixedLanListenerAffinity {
  const rootNorm = path.resolve(ctx.rootDirectory).replace(/\//g, '\\').toLowerCase()
  const cmd = (listener.commandLine ?? '').replace(/\//g, '\\').toLowerCase()
  const exe = (listener.executablePath ?? '').replace(/\//g, '\\').toLowerCase()

  if (cmd.includes(rootNorm) || cmd.includes('caddyfile.generated')) {
    return 'same_system'
  }
  if (listener.processName?.toLowerCase() === 'caddy.exe' || exe.endsWith('caddy.exe')) {
    if (cmd.includes('servidor-lan') || cmd.includes('caddyfile.generated')) {
      return cmd.includes(rootNorm) ? 'same_system' : 'other_omps'
    }
  }
  if (listener.processName) return 'foreign'
  return 'unknown'
}

function pickPrimaryListener(listeners: TcpPortListenerIdentity[]): TcpPortListenerIdentity | null {
  if (listeners.length === 0) return null
  if (listeners.length === 1) return listeners[0]
  return null
}

function buildImpactSummary(listener: TcpPortListenerIdentity): string {
  const parts = [
    `Encerrar o processo liberará a porta TCP 8080 exigida pelo Servidor OMPS.`,
    listener.processName ? `Processo: ${listener.processName}` : null,
    listener.pid ? `PID: ${listener.pid}` : null,
    listener.executablePath ? `Executável: ${listener.executablePath}` : null,
    listener.serviceName ? `Serviço Windows: ${listener.serviceName}` : null,
    `A aplicação em execução pode ser interrompida imediatamente.`,
  ].filter(Boolean)
  return parts.join(' ')
}

function buildManualSteps(listener: TcpPortListenerIdentity | null, blockReason: string | null): string[] {
  const steps = [
    'Libere a porta TCP 8080 antes de continuar (Servidor OMPS não usa outra porta).',
    'No Windows: Gerenciador de Tarefas → Detalhes → encerre o processo listado, ou pare o serviço correspondente.',
    'No Linux: use `ss -tlnp sport = :8080` e encerre o processo com cuidado (`systemctl stop` se for serviço).',
  ]
  if (listener?.pid && listener.processName) {
    steps.unshift(`Processo em conflito: ${listener.processName} (PID ${listener.pid}).`)
  }
  if (blockReason) {
    steps.push(blockReason)
  }
  return steps
}

export async function persistPort8080ReleaseAuthorization(
  systemId: string,
  authorization: FixedLanPort8080ReleaseAuthorization,
): Promise<void> {
  const filePath = authorizationPath(systemId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(authorization, null, 2), 'utf8')
}

export async function readPort8080ReleaseAuthorization(
  systemId: string,
): Promise<FixedLanPort8080ReleaseAuthorization | null> {
  try {
    const raw = JSON.parse(await fs.readFile(authorizationPath(systemId), 'utf8')) as FixedLanPort8080ReleaseAuthorization
    if (raw.version !== 1 || raw.port !== 8080 || typeof raw.actionToken !== 'string') return null
    return raw
  } catch {
    return null
  }
}

export async function clearPort8080ReleaseAuthorization(systemId: string): Promise<void> {
  try {
    await fs.unlink(authorizationPath(systemId))
  } catch {
    // ausente
  }
}

export function formatListenerDiagnosisLine(listener: TcpPortListenerIdentity): string {
  const addr = listener.localAddress ?? '?'
  const pid = listener.pid ?? '?'
  const name = listener.processName ?? 'desconhecido'
  const exe = listener.executablePath ? ` — ${listener.executablePath}` : ''
  const svc = listener.serviceName ? ` (serviço ${listener.serviceName})` : ''
  return `${addr}:${listener.port} ← ${name} (PID ${pid})${exe}${svc}`
}

export async function diagnoseFixedLanPort8080Conflict(input: {
  systemId: string
  rootDirectory: string
  requiredPort?: number
}): Promise<FixedLanPort8080ConflictDetails> {
  const requiredPort = input.requiredPort ?? 8080
  const probe = await probeTcpPortListeners(requiredPort)

  if (!probe.ok) {
    return {
      code: FIXED_LAN_HTTP_PORT_CONFLICT_CODE,
      requiredPort,
      probe,
      primaryListener: null,
      affinity: 'unknown',
      releaseAuthorization: null,
      manualSteps: buildManualSteps(null, probe.message),
    }
  }

  if (!probe.listening) {
    return {
      code: FIXED_LAN_HTTP_PORT_CONFLICT_CODE,
      requiredPort,
      probe,
      primaryListener: null,
      affinity: 'unknown',
      releaseAuthorization: null,
      manualSteps: [],
    }
  }

  const primaryListener = pickPrimaryListener(probe.listeners)
  const affinity =
    primaryListener != null
      ? evaluateListenerOmpsAffinity(primaryListener, input)
      : probe.listeners.some((l) => evaluateListenerOmpsAffinity(l, input) === 'same_system')
        ? 'same_system'
        : 'foreign'

  let releaseAuthorization: FixedLanPort8080ReleaseAuthorization | null = null
  const blockReason = primaryListener ? protectedProcessBlockReason(primaryListener) : 'Vários processos escutam na porta 8080 — encerramento automático não é oferecido.'

  if (primaryListener && affinity !== 'same_system' && !blockReason) {
    releaseAuthorization = {
      version: 1,
      actionToken: crypto.randomUUID(),
      port: 8080,
      issuedAt: new Date().toISOString(),
      listenerFingerprint: listenerIdentityFingerprint(primaryListener),
      listener: primaryListener,
      impactSummary: buildImpactSummary(primaryListener),
    }
    await persistPort8080ReleaseAuthorization(input.systemId, releaseAuthorization)
  } else {
    await clearPort8080ReleaseAuthorization(input.systemId)
  }

  return {
    code: FIXED_LAN_HTTP_PORT_CONFLICT_CODE,
    requiredPort,
    probe,
    primaryListener,
    affinity,
    releaseAuthorization,
    manualSteps: buildManualSteps(primaryListener, blockReason),
  }
}

export function buildFixedLanPort8080BlockedMessage(details: FixedLanPort8080ConflictDetails): string {
  if (!details.probe.ok) {
    return formatFixedLanPortBlockedMessage(details.requiredPort, details.probe.message)
  }
  if (!details.probe.listening) {
    return formatFixedLanPortBlockedMessage(details.requiredPort, 'Porta reportada ocupada, mas nenhum listener foi identificado.')
  }

  const lines = details.probe.listeners.map(formatListenerDiagnosisLine)
  const listenerText =
    lines.length === 1
      ? lines[0]
      : `Vários listeners na porta ${details.requiredPort}:\n${lines.map((l) => `- ${l}`).join('\n')}`

  const suffix = details.releaseAuthorization
    ? ' Você pode autorizar o encerramento deste processo específico na interface do Manager (sem fallback de porta).'
    : ` ${details.manualSteps[0] ?? 'Libere a porta manualmente.'}`

  return formatFixedLanPortBlockedMessage(
    details.requiredPort,
    `${listenerText}.${suffix}`,
  )
}
