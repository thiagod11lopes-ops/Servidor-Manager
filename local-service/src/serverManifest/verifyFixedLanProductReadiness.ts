import type { ProbeLocalHttpUrlResult } from '../network/probeLocalHttpUrl.ts'
import { probeLocalHttpUrl } from '../network/probeLocalHttpUrl.ts'
import {
  isAcceptableFixedLanLoginProbe,
  locationMatchesContract,
  probeContractLanHttpUrl,
  type ContractLanProbe,
} from '../network/probeContractLanHttpUrl.ts'
import type { ServidorOmpsLanAccess } from '../products/servidorOmpsProductConfig.ts'
import { verifyExpectedLanHostOnMachine } from '../products/servidorOmpsFixedLanRuntime.ts'
import { probeTcpPortListeners, type TcpPortListenerProbe } from './lanTcpPortListenerProbe.ts'
import { validateServerConnectionForFixedLanContract } from './validateServerConnectionDocument.ts'
import type { LanReadinessCheck, LanReadinessResult } from './verifyManifestLanReadiness.ts'

export const FIXED_LAN_READINESS_TIMEOUTS = {
  kongLoopbackMs: 6_000,
  contractHttpMs: 8_000,
  tcpProbeMs: 5_000,
} as const

export type FixedLanReadinessDeps = {
  loopbackProbe?: typeof probeLocalHttpUrl
  contractProbe?: ContractLanProbe
  tcpProbe?: TcpPortListenerProbe
}

function fail(checks: LanReadinessCheck[], message: string): LanReadinessResult {
  const failed = checks.filter((c) => !c.ok)
  return {
    ok: false,
    checks,
    message:
      failed.length > 0
        ? `Prontidão LAN fixa reprovada (${failed.map((f) => f.id).join(', ')}). ${failed[0]?.detail ?? ''}`.trim()
        : message,
  }
}

/**
 * Prontidão real do Servidor OMPS no endereço contratual (não basta loopback).
 */
export async function verifyFixedLanProductReadiness(
  fixed: ServidorOmpsLanAccess,
  deps: FixedLanReadinessDeps = {},
  resolvedHost?: string,
  effectiveHttpPort?: number,
): Promise<LanReadinessResult> {
  const host = (resolvedHost ?? fixed.expectedLanHost ?? '').trim()
  if (!host) {
    return fail([], 'IPv4 LAN do Servidor OMPS não pôde ser determinado para a verificação.')
  }
  const port = effectiveHttpPort ?? fixed.requiredHttpPort
  const expected = { host, port }
  const baseUrl = `http://${host}:${port}`
  const loginUrl = `${baseUrl}${fixed.entryPath.startsWith('/') ? fixed.entryPath : `/${fixed.entryPath}`}`
  const discoveryUrl = `${baseUrl}/server-connection.json`

  const loopbackProbe = deps.loopbackProbe ?? probeLocalHttpUrl
  const contractProbe = deps.contractProbe ?? probeContractLanHttpUrl
  const tcpProbe = deps.tcpProbe ?? probeTcpPortListeners

  const checks: LanReadinessCheck[] = []

  const hostCheck = verifyExpectedLanHostOnMachine(host)
  checks.push({
    id: 'fixed.host.assigned',
    ok: hostCheck.ok,
    detail: hostCheck.ok ? `${host} em interface local` : hostCheck.message,
  })

  const listeners = await tcpProbe(port)
  const tcpOk = listeners.ok && listeners.listening
  checks.push({
    id: 'fixed.tcp.port',
    ok: tcpOk,
    detail: listeners.ok
      ? tcpOk
        ? `Porta TCP ${port} em escuta (${listeners.listeners.length} listener(s))`
        : `Porta TCP ${port} não está em escuta`
      : listeners.message,
  })

  const kong: ProbeLocalHttpUrlResult = await loopbackProbe('http://127.0.0.1:54321/auth/v1/health', {
    timeoutMs: FIXED_LAN_READINESS_TIMEOUTS.kongLoopbackMs,
  })
  checks.push({
    id: 'supabase.kong.loopback',
    ok: kong.ok && kong.responded,
    detail: kong.ok ? `HTTP ${kong.status}` : kong.message,
  })

  const login = await contractProbe(loginUrl, expected, {
    timeoutMs: FIXED_LAN_READINESS_TIMEOUTS.contractHttpMs,
  })
  const loginOk = isAcceptableFixedLanLoginProbe(login, expected)
  const redirectOk =
    !login.ok || login.status < 300 || login.status >= 400
      ? true
      : locationMatchesContract(login.location, expected)
  checks.push({
    id: 'fixed.http.login',
    ok: loginOk && redirectOk,
    detail: login.ok
      ? `HTTP ${login.status}${login.location ? ` → ${login.location}` : ''}`
      : login.message,
  })

  if (!redirectOk) {
    checks.push({
      id: 'fixed.http.redirect',
      ok: false,
      detail: `Redirecionamento de /login aponta fora de ${host}:${port} (${login.ok ? login.location : '?'})`,
    })
  } else {
    checks.push({
      id: 'fixed.http.redirect',
      ok: true,
      detail: 'Sem redirecionamento para host/porta divergentes',
    })
  }

  const connection = await contractProbe(discoveryUrl, expected, {
    timeoutMs: FIXED_LAN_READINESS_TIMEOUTS.contractHttpMs,
    readBody: true,
  })
  let connectionDocOk = false
  let connectionDetail = connection.ok ? `HTTP ${connection.status}` : connection.message

  if (connection.ok && connection.bodyText) {
    try {
      const parsed = JSON.parse(connection.bodyText) as unknown
      const validated = validateServerConnectionForFixedLanContract(parsed, expected)
      connectionDocOk = validated.ok
      connectionDetail = validated.ok
        ? `schema ${validated.origin} /login OK`
        : validated.message
      checks.push({
        id: 'fixed.connection.schema',
        ok: validated.ok,
        detail: connectionDetail,
      })
    } catch (error) {
      connectionDetail = error instanceof Error ? error.message : 'JSON inválido'
      checks.push({
        id: 'fixed.connection.schema',
        ok: false,
        detail: connectionDetail,
      })
    }
  } else {
    checks.push({
      id: 'fixed.connection.schema',
      ok: false,
      detail: connectionDetail,
    })
  }

  checks.push({
    id: 'fixed.http.server-connection',
    ok: connection.ok && connection.responded && connection.status >= 200 && connection.status < 500 && connectionDocOk,
    detail: connectionDetail,
  })

  const failed = checks.filter((c) => !c.ok)
  if (failed.length > 0) {
    return fail(checks, '')
  }

  return {
    ok: true,
    checks,
    message: `Prontidão LAN fixa OK em ${loginUrl} (host ${host}, porta ${port}, server-connection.json válido).`,
  }
}
