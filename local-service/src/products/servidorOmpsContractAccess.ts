import {
  isAcceptableFixedLanLoginProbe,
  locationMatchesContract,
  probeContractLanHttpUrl,
  type ContractLanProbe,
} from '../network/probeContractLanHttpUrl.ts'
import { validateServerConnectionForFixedLanContract } from '../serverManifest/validateServerConnectionDocument.ts'
import { FIXED_LAN_READINESS_TIMEOUTS } from '../serverManifest/verifyFixedLanProductReadiness.ts'
import {
  loadActiveServidorOmpsFixedLanPolicy,
  resolveServidorOmpsContractLoginUrlForDisplay,
  verifyExpectedLanHostOnMachine,
  type ServidorOmpsFixedLanPolicy,
} from './servidorOmpsFixedLanRuntime.ts'
import { buildOmpsLanUrls } from './servidorOmpsProductConfig.ts'
import { resolveActiveOmpsHttpPortOnLoopback } from '../serverManifest/lanHttpPortGuard.ts'
import { probeTcpPortListeners } from '../serverManifest/lanTcpPortListenerProbe.ts'
import { isAllowedOmpsHttpPort } from './servidorOmpsProductConfig.ts'
import { formatServidorOmpsEmbeddedInstallHint } from '../servidorOmps/servidorOmpsEmbeddedInstallHint.ts'
import { resolveEmbeddedOmpsSystemId } from '../servidorOmps/ensureServidorOmpsEmbeddedRuntime.ts'

export type OmpsContractAccessAvailability = 'active' | 'unavailable'

export type OmpsContractAccessResponse =
  | {
      ok: true
      available: true
      loginUrl: string
      availability: OmpsContractAccessAvailability
      message: string
      checkedAt: string
      lastSuccessAt: string | null
      dashboardOrigin: string | null
      dashboardDiffersFromContract: boolean
    }
  | {
      ok: false
      available: false
      message: string
      checkedAt: string
    }

export type OmpsContractAccessProbeResult = {
  availability: OmpsContractAccessAvailability
  message: string
  loginUrl: string
  lastSuccessAt: string | null
  dashboardOrigin: string | null
  dashboardDiffersFromContract: boolean
}

function readDashboardOrigin(): string | null {
  const raw = process.env.SERVIDOR_MANAGER_UI_ORIGIN?.trim()
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * Verificação HTTP real no endereço contratual (login + server-connection.json).
 * Reutiliza as mesmas regras de probe do readiness LAN fixa, sem exigir Kong loopback.
 */
export type ServidorOmpsContractAccessDeps = {
  contractProbe?: ContractLanProbe
  tcpProbe?: typeof probeTcpPortListeners
  embeddedSystemId?: string | null
  installHint?: string | null
}

export async function probeServidorOmpsContractAccess(
  policy: ServidorOmpsFixedLanPolicy,
  deps: ServidorOmpsContractAccessDeps = {},
): Promise<OmpsContractAccessProbeResult> {
  const { fixed } = policy
  const host = policy.resolvedHost.trim()
  const activePort =
    (await resolveActiveOmpsHttpPortOnLoopback(fixed)) ??
    (isAllowedOmpsHttpPort(fixed, policy.urls.port) ? policy.urls.port : fixed.requiredHttpPort)
  const urls = buildOmpsLanUrls(fixed, host, activePort)
  const port = activePort
  const expected = { host, port }
  const loginUrl = urls.loginUrl
  const discoveryUrl = `${urls.baseUrl}/server-connection.json`
  const checkedAt = new Date().toISOString()
  const dashboardOrigin = readDashboardOrigin()
  const contractOrigin = urls.baseUrl
  const dashboardDiffersFromContract =
    dashboardOrigin != null && dashboardOrigin.toLowerCase() !== contractOrigin.toLowerCase()

  const hostCheck = verifyExpectedLanHostOnMachine(host)
  if (!hostCheck.ok) {
    return {
      availability: 'unavailable',
      message: hostCheck.message,
      loginUrl,
      lastSuccessAt: null,
      dashboardOrigin,
      dashboardDiffersFromContract,
    }
  }

  const tcpProbe = deps.tcpProbe ?? probeTcpPortListeners
  const contractProbe = deps.contractProbe ?? probeContractLanHttpUrl

  const listeners = await tcpProbe(port)
  if (!listeners.ok || !listeners.listening) {
    let detail = listeners.ok
      ? `Porta TCP ${port} não está em escuta nesta máquina.`
      : listeners.message
    const hint =
      deps.installHint ??
      (deps.embeddedSystemId != null
        ? await formatServidorOmpsEmbeddedInstallHint(deps.embeddedSystemId)
        : null)
    if (hint) {
      detail = `${detail} ${hint}`
    }
    return {
      availability: 'unavailable',
      message: detail,
      loginUrl,
      lastSuccessAt: null,
      dashboardOrigin,
      dashboardDiffersFromContract,
    }
  }

  const login = await contractProbe(loginUrl, expected, {
    timeoutMs: FIXED_LAN_READINESS_TIMEOUTS.contractHttpMs,
  })
  const loginOk = isAcceptableFixedLanLoginProbe(login, expected)
  const redirectOk =
    !login.ok || login.status < 300 || login.status >= 400
      ? true
      : locationMatchesContract(login.location, expected)

  if (!loginOk || !redirectOk) {
    const detail = login.ok
      ? `Resposta inesperada em /login (HTTP ${login.status}${login.location ? ` → ${login.location}` : ''})`
      : login.message
    return {
      availability: 'unavailable',
      message: detail,
      loginUrl,
      lastSuccessAt: null,
      dashboardOrigin,
      dashboardDiffersFromContract,
    }
  }

  const connection = await contractProbe(discoveryUrl, expected, {
    timeoutMs: FIXED_LAN_READINESS_TIMEOUTS.contractHttpMs,
    readBody: true,
  })

  if (!connection.ok || !connection.responded || connection.status < 200 || connection.status >= 500) {
    return {
      availability: 'unavailable',
      message: connection.ok ? `HTTP ${connection.status} em /server-connection.json` : connection.message,
      loginUrl,
      lastSuccessAt: null,
      dashboardOrigin,
      dashboardDiffersFromContract,
    }
  }

  let schemaMessage = 'server-connection.json OK'
  if (connection.bodyText) {
    try {
      const parsed = JSON.parse(connection.bodyText) as unknown
      const validated = validateServerConnectionForFixedLanContract(parsed, expected)
      if (!validated.ok) {
        return {
          availability: 'unavailable',
          message: validated.message,
          loginUrl,
          lastSuccessAt: null,
          dashboardOrigin,
          dashboardDiffersFromContract,
        }
      }
      schemaMessage = validated.ok ? `Contrato confirmado (${validated.origin})` : validated.message
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'JSON inválido'
      return {
        availability: 'unavailable',
        message: msg,
        loginUrl,
        lastSuccessAt: null,
        dashboardOrigin,
        dashboardDiffersFromContract,
      }
    }
  } else {
    return {
      availability: 'unavailable',
      message: 'server-connection.json sem corpo.',
      loginUrl,
      lastSuccessAt: null,
      dashboardOrigin,
      dashboardDiffersFromContract,
    }
  }

  let message = `${schemaMessage}. HTTP /login ${login.status}.`
  if (dashboardDiffersFromContract && dashboardOrigin) {
    message += ` O painel deste app usa ${dashboardOrigin}; o acesso dos usuários permanece em ${loginUrl}.`
  }

  return {
    availability: 'active',
    message,
    loginUrl,
    lastSuccessAt: checkedAt,
    dashboardOrigin,
    dashboardDiffersFromContract,
  }
}

export async function getServidorOmpsContractAccessStatus(): Promise<OmpsContractAccessResponse> {
  const checkedAt = new Date().toISOString()
  const policy = await loadActiveServidorOmpsFixedLanPolicy()
  if (!policy) {
    const display = await resolveServidorOmpsContractLoginUrlForDisplay()
    if (!display.loginUrl) {
      return {
        ok: false,
        available: false,
        message: display.setupMessage,
        checkedAt,
      }
    }

    const dashboardOrigin = readDashboardOrigin()
    const message =
      display.setupMessage ??
      'Endereço do Usuário OMPS definido pelo contrato; verificação HTTP completa indisponível neste momento.'

    return {
      ok: true,
      available: true,
      loginUrl: display.loginUrl,
      availability: 'unavailable',
      message,
      checkedAt,
      lastSuccessAt: null,
      dashboardOrigin,
      dashboardDiffersFromContract: false,
    }
  }

  const embeddedSystemId = await resolveEmbeddedOmpsSystemId()
  const probe = await probeServidorOmpsContractAccess(policy, { embeddedSystemId })
  return {
    ok: true,
    available: true,
    loginUrl: probe.loginUrl,
    availability: probe.availability,
    message: probe.message,
    checkedAt,
    lastSuccessAt: probe.lastSuccessAt,
    dashboardOrigin: probe.dashboardOrigin,
    dashboardDiffersFromContract: probe.dashboardDiffersFromContract,
  }
}
