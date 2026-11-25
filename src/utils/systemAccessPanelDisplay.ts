import type { SystemAccessMode } from '../types/systemAccessMode.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'
import {
  effectivePublishedHttpPort,
  isDevPreviewHttpPort,
  isInvalidLanShareHost,
  isRfc1918Host,
  isUnofficialUserAccessUrl,
} from './lanShareUrl.ts'
import { isLoopbackHttpOrHttpsUrl } from './systemLocalHttpDisplay.ts'

export type AccessPanelOperationalKind =
  | 'mode_unset'
  | 'app_stopped'
  | 'local_no_url'
  | 'local_url_unverified'
  | 'local_http_ok'
  | 'lan_no_url'
  | 'lan_url_unverified'
  | 'lan_http_ok'

export type SystemAccessPanelView = {
  modeLabel: string | null
  modeConfigured: boolean
  operationalLabel: string
  operationalKind: AccessPanelOperationalKind
  badgeClass: 'badge-mock' | 'badge-real' | 'badge-warn'
  shareUrl: string | null
  shareUrlHint: string | null
  instructions: string[]
  showCopy: boolean
}

function modeLabel(mode: SystemAccessMode): string {
  return mode === 'local' ? 'Local (neste computador)' : 'Rede local (LAN)'
}

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function scrubUrlField(
  value: string | null | undefined,
  status: SystemRuntimeStatus,
): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || !isHttpOrHttpsUrl(trimmed)) return null
  const httpPort = effectivePublishedHttpPort(status)
  if (isUnofficialUserAccessUrl(trimmed, httpPort, status.runtimeKind)) return null
  return trimmed
}

export function normalizeRuntimeStatusForUi(status: SystemRuntimeStatus): SystemRuntimeStatus {
  const httpPort = effectivePublishedHttpPort(status)
  const loginUrl = scrubUrlField(status.loginUrl, status)
  const lanAccessUrl = scrubUrlField(status.lanAccessUrl, status)
  return {
    ...status,
    port: status.runtimeKind === 'manifest-lan' ? httpPort : status.port,
    loginUrl,
    lanAccessUrl,
  }
}

export function resolveShareableLanUrl(status: SystemRuntimeStatus): string | null {
  const expectedPort =
    status.runtimeKind === 'manifest-lan' ? effectivePublishedHttpPort(status) : null

  for (const candidate of [status.lanAccessUrl, status.loginUrl]) {
    const trimmed = scrubUrlField(candidate, status)
    if (!trimmed) continue
    if (isLoopbackHttpOrHttpsUrl(trimmed)) continue
    try {
      const parsed = new URL(trimmed)
      if (isInvalidLanShareHost(parsed.hostname)) continue
      if (!isRfc1918Host(parsed.hostname)) continue
      if (expectedPort != null) {
        const port = parsed.port ? Number.parseInt(parsed.port, 10) : 80
        if (isDevPreviewHttpPort(port)) continue
        if (port !== expectedPort) continue
      }
      return trimmed
    } catch {
      continue
    }
  }
  return null
}

export function resolveLocalMachineUrl(status: SystemRuntimeStatus): string | null {
  for (const candidate of [status.loginUrl, status.lanAccessUrl]) {
    const trimmed = scrubUrlField(candidate, status)
    if (!trimmed) continue
    if (isLoopbackHttpOrHttpsUrl(trimmed)) return trimmed
    try {
      const parsed = new URL(trimmed)
      parsed.hostname = '127.0.0.1'
      return parsed.toString()
    } catch {
      continue
    }
  }
  return null
}

export function resolveUserFacingAccessUrl(
  status: SystemRuntimeStatus | null | undefined,
): string | null {
  if (!status) return null
  if (status.accessMode === 'local') {
    return resolveLocalMachineUrl(status) ?? resolveShareableLanUrl(status)
  }
  return resolveShareableLanUrl(status)
}

export type UserFacingAccessDisplay = {
  url: string | null
  active: boolean
  statusLabel: string
  hint: string | null
}

export function isUserFacingAccessActive(
  status: SystemRuntimeStatus | null | undefined,
): boolean {
  if (!status) return false
  if (status.runtimeKind === 'manifest-lan') {
    return status.caddyRunning === true
  }
  return status.state === 'executando'
}

export function resolveUserFacingAccessDisplay(
  status: SystemRuntimeStatus | null | undefined,
): UserFacingAccessDisplay {
  const normalized = status ? normalizeRuntimeStatusForUi(status) : null
  const url = resolveUserFacingAccessUrl(normalized)
  const manifestLan = normalized?.runtimeKind === 'manifest-lan'
  const state = normalized?.state

  if (!normalized) {
    return {
      url: null,
      active: false,
      statusLabel: 'Indisponível',
      hint: 'Atualize a execução para carregar o estado.',
    }
  }

  if (!url) {
    if (state === 'parado' || state === 'instalado') {
      return {
        url: null,
        active: false,
        statusLabel: 'Parado',
        hint: manifestLan
          ? 'Inicie o sistema para publicar o endereço LAN (porta HTTP do Caddy).'
          : 'Inicie o sistema para obter o endereço de acesso.',
      }
    }
    return {
      url: null,
      active: false,
      statusLabel: 'Indisponível',
      hint: 'Atualize a execução — endereço legado foi descartado ou a LAN ainda não foi detectada.',
    }
  }

  if (isUserFacingAccessActive(normalized)) {
    return { url, active: true, statusLabel: 'Ativo', hint: null }
  }

  if (state === 'iniciando') {
    return {
      url,
      active: false,
      statusLabel: 'Iniciando…',
      hint: 'Aguarde o Caddy responder na porta HTTP.',
    }
  }

  if (state === 'parado' || state === 'instalado') {
    return {
      url,
      active: false,
      statusLabel: 'Parado',
      hint: 'Inicie o sistema para que o endereço responda.',
    }
  }

  if (state === 'erro') {
    return {
      url,
      active: false,
      statusLabel: 'Erro',
      hint: normalized.lastError ?? 'Verifique logs e reinicie a execução.',
    }
  }

  return {
    url,
    active: false,
    statusLabel: 'Inativo',
    hint: manifestLan
      ? 'Proxy Caddy ainda não responde — use Atualizar execução ou Iniciar.'
      : 'Serviço ainda não responde — inicie ou atualize a execução.',
  }
}

function isAppRunning(status: SystemRuntimeStatus): boolean {
  return status.state === 'executando'
}

export function buildSystemAccessPanelView(input: {
  accessMode: SystemAccessMode | null | undefined
  runtimeStatus: SystemRuntimeStatus | null | undefined
}): SystemAccessPanelView {
  const { accessMode, runtimeStatus } = input

  if (!accessMode) {
    return {
      modeLabel: null,
      modeConfigured: false,
      operationalLabel: 'Modo não definido',
      operationalKind: 'mode_unset',
      badgeClass: 'badge-mock',
      shareUrl: null,
      shareUrlHint: null,
      instructions: [
        'Escolha Local ou Rede local (LAN) ao instalar o sistema.',
        'Sistemas antigos com modo de acesso obsoleto precisam ser reinstalados ou ter o modo atualizado (Local ou LAN).',
      ],
      showCopy: false,
    }
  }

  const base = {
    modeLabel: modeLabel(accessMode),
    modeConfigured: true,
    badgeClass: 'badge-mock' as const,
    shareUrl: null as string | null,
    shareUrlHint: null as string | null,
    showCopy: false,
  }

  if (!runtimeStatus) {
    return {
      ...base,
      operationalLabel: 'Runtime não carregado',
      operationalKind: 'app_stopped',
      instructions: ['Atualize a execução para ver o estado de acesso.'],
    }
  }

  if (!isAppRunning(runtimeStatus)) {
    return {
      ...base,
      operationalLabel: 'Aplicação parada',
      operationalKind: 'app_stopped',
      instructions: ['Inicie o sistema na secção Execução antes de partilhar um endereço.'],
    }
  }

  if (accessMode === 'local') {
    const url = resolveLocalMachineUrl(runtimeStatus)
    if (!url) {
      return {
        ...base,
        operationalLabel: 'Endereço local indisponível',
        operationalKind: 'local_no_url',
        instructions: ['Inicie o sistema e confirme a URL de login (localhost / 127.0.0.1).'],
      }
    }
    if (runtimeStatus.localHttpReachable === true) {
      return {
        ...base,
        operationalLabel: 'Local — serviço responde neste PC',
        operationalKind: 'local_http_ok',
        badgeClass: 'badge-real',
        shareUrl: url,
        shareUrlHint: 'Abra no browser deste computador servidor.',
        instructions: ['Outros dispositivos na LAN devem usar o modo Rede local (LAN), não este link.'],
        showCopy: true,
      }
    }
    return {
      ...base,
      operationalLabel: 'Endereço local — HTTP não confirmado',
      operationalKind: 'local_url_unverified',
      shareUrl: url,
      shareUrlHint: 'Verifique se Caddy/proxy responde em 127.0.0.1.',
      instructions: ['Atualize a execução para repetir o probe HTTP local.'],
      showCopy: true,
    }
  }

  const lanUrl = resolveShareableLanUrl(runtimeStatus)
  if (!lanUrl) {
    return {
      ...base,
      operationalLabel: 'Endereço LAN indisponível',
      operationalKind: 'lan_no_url',
      instructions: [
        'Confirme allowLanAccess em C:\\ServidorManager\\config\\network.json.',
        'Outros dispositivos não devem usar 127.0.0.1 — aguarde o IPv4 da LAN.',
      ],
    }
  }

  if (runtimeStatus.localHttpReachable === true) {
    return {
      ...base,
      operationalLabel: 'LAN — serviço responde; teste noutro dispositivo',
      operationalKind: 'lan_http_ok',
      badgeClass: 'badge-warn',
      shareUrl: lanUrl,
      shareUrlHint: 'Mesma Wi‑Fi ou cabo Ethernet. Confirme firewall Windows se não abrir.',
      instructions: [
        'Não partilhe 127.0.0.1 com telemóveis ou PCs remotos — use o IP abaixo.',
      ],
      showCopy: true,
    }
  }

  return {
    ...base,
    operationalLabel: 'Endereço LAN disponível — HTTP local não confirmado',
    operationalKind: 'lan_url_unverified',
    shareUrl: lanUrl,
    shareUrlHint: 'Verifique se a aplicação responde antes de orientar utilizadores.',
    instructions: ['Atualize a execução para repetir o probe HTTP local.'],
    showCopy: true,
  }
}
