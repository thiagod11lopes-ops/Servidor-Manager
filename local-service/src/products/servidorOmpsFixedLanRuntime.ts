import {
  buildOmpsLanUrls,
  isServidorOmpsFixedLanProduct,
  normalizeServidorOmpsLanAccess,
  readActiveServidorOmpsProductConfig,
  resolveOmpsContractHost,
  type ServidorOmpsLanAccess,
  type ServidorOmpsLanUrls,
  type ServidorOmpsProductConfig,
} from './servidorOmpsProductConfig.ts'
import { getManagerInstallRoot } from '../bundledOmps/managerInstallRoot.ts'
import { checkIpv4AssignedOnLocalMachine } from '../config/networkAccess.ts'
import { resolvePreferredLanHostOrAuto } from '../network/resolvePreferredLanIPv4.ts'

export type ServidorOmpsFixedLanPolicy = {
  config: ServidorOmpsProductConfig
  /** Normalizado (v2/v3). */
  fixed: ServidorOmpsLanAccess
  urls: ServidorOmpsLanUrls
  resolvedHost: string
  hostSelectionNote?: string
  hostSelectionAmbiguous: boolean
}

export async function resolveOmpsProductLanHost(
  lan: ServidorOmpsLanAccess,
): Promise<
  | { ok: true; host: string; note?: string; ambiguous: boolean }
  | { ok: false; message: string }
> {
  if (lan.lanHostMode === 'local') {
    return { ok: true, host: '127.0.0.1', ambiguous: false }
  }
  if (lan.lanHostMode === 'fixed') {
    const host = lan.expectedLanHost?.trim()
    if (!host) return { ok: false, message: 'IPv4 fixo ausente no contrato do produto.' }
    const assigned = verifyExpectedLanHostOnMachine(host)
    if (!assigned.ok) return assigned
    return { ok: true, host, ambiguous: false }
  }
  const auto = await resolvePreferredLanHostOrAuto()
  if (!auto.ok) return auto
  const assigned = verifyExpectedLanHostOnMachine(auto.host)
  if (!assigned.ok) return assigned
  return { ok: true, host: auto.host, note: auto.note, ambiguous: auto.ambiguous }
}

/**
 * Política LAN do produto Servidor OMPS (resources/servidor-omps-product.json).
 */
export async function loadActiveServidorOmpsFixedLanPolicy(): Promise<ServidorOmpsFixedLanPolicy | null> {
  const config = await readActiveServidorOmpsProductConfig()
  if (!isServidorOmpsFixedLanProduct(config)) return null
  const fixed = normalizeServidorOmpsLanAccess(config)
  const resolved = await resolveOmpsProductLanHost(fixed)
  if (!resolved.ok) return null
  return {
    config,
    fixed,
    urls: buildOmpsLanUrls(fixed, resolved.host),
    resolvedHost: resolved.host,
    hostSelectionNote: resolved.note,
    hostSelectionAmbiguous: resolved.ambiguous,
  }
}

/** Endereço de login do Usuário OMPS para exibição, mesmo quando a política LAN ativa não pôde ser carregada. */
export async function resolveServidorOmpsContractLoginUrlForDisplay(): Promise<
  | { loginUrl: string; setupMessage: string | null }
  | { loginUrl: null; setupMessage: string }
> {
  const config = await readActiveServidorOmpsProductConfig()
  if (!config) {
    const installRoot = getManagerInstallRoot()
    const hint = installRoot
      ? `A pasta ${installRoot} não contém resources/servidor-omps-product.json (instalação Manager genérica).`
      : 'Raiz da instalação do Manager não identificada.'
    return {
      loginUrl: 'http://127.0.0.1:8080/login',
      setupMessage: `${hint} Use o pacote Servidor OMPS ou, em desenvolvimento, defina SERVIDOR_MANAGER_INSTALL_ROOT para release/servidor-omps/win-unpacked. Exibindo o endereço padrão do Usuário OMPS.`,
    }
  }
  if (!isServidorOmpsFixedLanProduct(config)) {
    return {
      loginUrl: null,
      setupMessage: 'Esta instalação não usa contrato LAN fixa/local do Servidor OMPS.',
    }
  }

  const fixed = normalizeServidorOmpsLanAccess(config)
  const resolved = await resolveOmpsProductLanHost(fixed)
  const host =
    resolved.ok ? resolved.host : (resolveOmpsContractHost(fixed) ?? '127.0.0.1')
  const loginUrl = buildOmpsLanUrls(fixed, host).loginUrl
  return {
    loginUrl,
    setupMessage: resolved.ok ? null : resolved.message,
  }
}

export function formatFixedLanHostMissingMessage(expectedLanHost: string): string {
  return [
    `Servidor OMPS não encontrou o IPv4 ${expectedLanHost} em uma interface local ativa.`,
    'Verifique Wi‑Fi/Ethernet ou defina ACOMOPMS_LAN_HOST no servidor.env.',
  ].join(' ')
}

export function formatFixedLanPortBlockedMessage(requiredHttpPort: number, detail: string): string {
  return [
    `Servidor OMPS exige a porta HTTP ${requiredHttpPort} (sem fallback para outra porta).`,
    detail,
  ].join(' ')
}

export function verifyExpectedLanHostOnMachine(expectedLanHost: string): { ok: true } | { ok: false; message: string } {
  const host = expectedLanHost.trim()
  if (host === '127.0.0.1' || host.toLowerCase() === 'localhost') {
    return { ok: true }
  }
  const check = checkIpv4AssignedOnLocalMachine(expectedLanHost)
  if (check.ok) return { ok: true }
  if (check.reason === 'interfaces_unavailable') {
    return { ok: false, message: check.message }
  }
  return { ok: false, message: formatFixedLanHostMissingMessage(expectedLanHost) }
}

export async function verifyServidorOmpsFixedLanHostReady(
  policy: Pick<ServidorOmpsFixedLanPolicy, 'fixed'>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const resolved = await resolveOmpsProductLanHost(policy.fixed)
  if (!resolved.ok) return resolved
  return { ok: true }
}
