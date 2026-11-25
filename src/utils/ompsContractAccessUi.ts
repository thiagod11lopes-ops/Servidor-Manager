import type { OmpsContractAccessAvailability, OmpsContractAccessStatusResponse } from '../types/ompsContractAccess.ts'
import type { InstallationProgressSnapshot } from '../types/installationProgress.ts'
import { mergeOmpsEmbeddedInstallProgress } from './ompsAnalyzeProgressDisplay.ts'

export type OmpsContractAccessUiPhase = 'checking' | 'active' | 'unavailable'

export type OmpsContractAccessFrozenReport = {
  message: string
  phase: OmpsContractAccessUiPhase
  statusLabel: string
  lastCheckedAt: string
}

export type OmpsContractAccessUiState = {
  phase: OmpsContractAccessUiPhase
  /** Requisição HTTP de verificação em andamento (não altera mensagens exibidas até concluir). */
  analyzing: boolean
  /** Cópia do último resultado exibido enquanto `analyzing` (evita textos alternando). */
  frozenReport: OmpsContractAccessFrozenReport | null
  loginUrl: string
  statusLabel: string
  badgeClass: 'badge-mock' | 'badge-real' | 'badge-warn'
  message: string
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  /** Progresso da instalação embarcada durante Analizar (motor OMPS). */
  embeddedInstallProgress: InstallationProgressSnapshot | null
  analyzeStartedAt: string | null
}

export function initialOmpsContractAccessUiState(loginUrl = '—'): OmpsContractAccessUiState {
  return {
    phase: 'checking',
    analyzing: false,
    frozenReport: null,
    loginUrl,
    statusLabel: 'Verificando...',
    badgeClass: 'badge-mock',
    message: '',
    lastCheckedAt: null,
    lastSuccessAt: null,
    embeddedInstallProgress: null,
    analyzeStartedAt: null,
  }
}

function freezeReportForDisplay(state: OmpsContractAccessUiState): OmpsContractAccessFrozenReport | null {
  if (!state.lastCheckedAt) return null
  return {
    message: state.message,
    phase: state.phase,
    statusLabel: state.statusLabel,
    lastCheckedAt: state.lastCheckedAt,
  }
}

export function markOmpsContractAccessAnalyzing(state: OmpsContractAccessUiState): OmpsContractAccessUiState {
  return {
    ...state,
    analyzing: true,
    analyzeStartedAt: new Date().toISOString(),
    frozenReport: freezeReportForDisplay(state) ?? state.frozenReport,
  }
}

function isActiveEmbeddedInstallStatus(
  status: InstallationProgressSnapshot['status'] | undefined,
): boolean {
  return (
    status === 'running' ||
    status === 'awaiting_docker' ||
    status === 'partial' ||
    status === 'interrupted'
  )
}

export function applyOmpsEmbeddedInstallProgress(
  state: OmpsContractAccessUiState,
  progress: InstallationProgressSnapshot | null,
): OmpsContractAccessUiState {
  if (!progress) {
    if (!state.analyzing) {
      return { ...state, embeddedInstallProgress: null }
    }
    return state
  }
  // Snapshot antigo failed/succeeded no disco não deve “aparecer” como progresso ao abrir a página.
  if (!state.analyzing && !isActiveEmbeddedInstallStatus(progress.status)) {
    return { ...state, embeddedInstallProgress: null }
  }
  return {
    ...state,
    embeddedInstallProgress: mergeOmpsEmbeddedInstallProgress(state.embeddedInstallProgress, progress),
  }
}

export function shouldShowOmpsAnalyzeProgressBar(state: OmpsContractAccessUiState): boolean {
  if (state.analyzing) return true
  return isActiveEmbeddedInstallStatus(state.embeddedInstallProgress?.status)
}

/** Estado usado no painel Status / Analizar (preserva último relatório durante análise). */
export function resolveOmpsContractAccessDisplayState(state: OmpsContractAccessUiState): OmpsContractAccessUiState {
  if (!state.analyzing || !state.frozenReport) return state
  return {
    ...state,
    message: state.frozenReport.message,
    phase: state.frozenReport.phase,
    statusLabel: state.frozenReport.statusLabel,
    lastCheckedAt: state.frozenReport.lastCheckedAt,
    analyzing: false,
  }
}

function labelForAvailability(availability: OmpsContractAccessAvailability): string {
  return availability === 'active' ? 'Ativo' : 'Indisponível'
}

function badgeForPhase(phase: OmpsContractAccessUiPhase): OmpsContractAccessUiState['badgeClass'] {
  if (phase === 'active') return 'badge-real'
  if (phase === 'unavailable') return 'badge-warn'
  return 'badge-mock'
}

function pickLoginUrlFromPollResponse(
  previous: OmpsContractAccessUiState,
  response: OmpsContractAccessStatusResponse,
): string {
  if (response.ok && response.available && response.loginUrl.trim()) {
    return response.loginUrl.trim()
  }
  const fallback = !response.ok && response.loginUrl?.trim() ? response.loginUrl.trim() : ''
  if (fallback && isOmpsShareableLoginUrl(fallback)) return fallback
  if (isOmpsShareableLoginUrl(previous.loginUrl)) return previous.loginUrl.trim()
  return previous.loginUrl
}

function formatLanAccessProblem(state: OmpsContractAccessUiState): string {
  const msg = state.message.trim()
  if (msg) return msg
  if (state.statusLabel && state.statusLabel !== 'Verificando...') {
    return `${state.statusLabel}. Não foi possível determinar o endereço do Usuário OMPS.`
  }
  return 'Não foi possível determinar o endereço do Usuário OMPS. Verifique se o serviço local está ativo e se o Servidor OMPS foi provisionado.'
}

export function reduceOmpsContractAccessPoll(
  previous: OmpsContractAccessUiState,
  response: OmpsContractAccessStatusResponse,
): OmpsContractAccessUiState {
  if (!response.ok || !response.available) {
    return {
      ...previous,
      phase: 'unavailable',
      analyzing: false,
      analyzeStartedAt: null,
      frozenReport: null,
      loginUrl: pickLoginUrlFromPollResponse(previous, response),
      statusLabel: 'Indisponível',
      badgeClass: 'badge-warn',
      message: response.message.trim() || formatLanAccessProblem(previous),
      lastCheckedAt: response.checkedAt,
      lastSuccessAt: previous.lastSuccessAt,
    }
  }

  const phase: OmpsContractAccessUiPhase =
    response.availability === 'active' ? 'active' : 'unavailable'

  return {
    ...previous,
    phase,
    analyzing: false,
    analyzeStartedAt: null,
    frozenReport: null,
    loginUrl: response.loginUrl,
    statusLabel: labelForAvailability(response.availability),
    badgeClass: badgeForPhase(phase),
    message: response.message,
    lastCheckedAt: response.checkedAt,
    lastSuccessAt: response.lastSuccessAt ?? (phase === 'active' ? response.checkedAt : previous.lastSuccessAt),
    embeddedInstallProgress: phase === 'active' ? null : previous.embeddedInstallProgress,
  }
}

export function markOmpsContractAccessPollFailed(
  previous: OmpsContractAccessUiState,
  detail: string,
  checkedAt: string,
): OmpsContractAccessUiState {
  return {
    ...previous,
    phase: 'unavailable',
    analyzing: false,
    analyzeStartedAt: null,
    frozenReport: null,
    loginUrl: previous.loginUrl,
    statusLabel: 'Indisponível',
    badgeClass: 'badge-warn',
    message: detail,
    lastCheckedAt: checkedAt,
    lastSuccessAt: previous.lastSuccessAt,
  }
}

const HTTP_LOGIN_URL = /^https?:\/\//i

/** URL HTTP válida para exibir/copiar no dashboard (inclui 127.0.0.1 / localhost). */
export function isOmpsShareableLoginUrl(loginUrl: string): boolean {
  const trimmed = loginUrl.trim()
  if (!trimmed || trimmed === '—') return false
  if (!HTTP_LOGIN_URL.test(trimmed)) return false
  try {
    new URL(trimmed)
  } catch {
    return false
  }
  return true
}

export type OmpsLanAccessHealth = 'ok' | 'warn' | 'error'

export type DashboardLanAccessView = {
  displayUrl: string | null
  statusLine: string
  tone: 'checking' | 'ready' | 'pending' | 'unknown'
}

/** Verde / laranja / vermelho — resumo visual do endereço do Usuário OMPS. */
export function resolveOmpsLanAccessHealth(state: OmpsContractAccessUiState): OmpsLanAccessHealth {
  const display = resolveOmpsContractAccessDisplayState(state)
  if (state.analyzing && !state.frozenReport) return 'warn'
  if (display.phase === 'active') return 'ok'
  if (display.phase === 'checking') return 'warn'
  return 'error'
}

/** Título do painel de detalhes (mantém o último resultado enquanto analisa). */
export function resolveOmpsLanAccessPanelTitle(state: OmpsContractAccessUiState): string {
  const display = resolveOmpsContractAccessDisplayState(state)
  if (state.analyzing && state.frozenReport) {
    return display.statusLabel
  }
  return ompsLanAccessHealthLabel(resolveOmpsLanAccessHealth(state))
}

function formatCheckedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

function appendMessageLines(lines: string[], msg: string): void {
  const trimmedMsg = msg.trim()
  if (!trimmedMsg) return
  const parts = trimmedMsg.split(/(?<=[.!?])\s+/u)
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed) lines.push(trimmed)
  }
  if (lines.length === 0) lines.push(trimmedMsg)
}

/** Detalhes estáveis para o painel ao clicar no botão de status (último resultado conhecido). */
export function collectOmpsLanAccessProblems(state: OmpsContractAccessUiState): string[] {
  const display = resolveOmpsContractAccessDisplayState(state)
  const lines: string[] = []
  const hideVerboseErrors =
    Boolean(state.embeddedInstallProgress) && shouldShowOmpsAnalyzeProgressBar(state)

  if (hideVerboseErrors) {
    if (display.lastCheckedAt) {
      lines.push(`Última verificação: ${formatCheckedAt(display.lastCheckedAt)}`)
    }
    return lines
  }

  if (state.analyzing && display.message.trim()) {
    lines.push('Exibindo o último resultado conhecido enquanto a análise continua.')
  }
  appendMessageLines(lines, display.message)

  if (lines.length === 0 && display.phase === 'active') {
    lines.push('O serviço HTTP responde neste endereço.')
  }
  if (lines.length === 0 && display.phase === 'unavailable' && !isOmpsShareableLoginUrl(display.loginUrl)) {
    lines.push(formatLanAccessProblem(display))
  }
  if (lines.length === 0 && display.phase === 'unavailable' && isOmpsShareableLoginUrl(display.loginUrl)) {
    lines.push('O endereço está definido, mas o serviço HTTP não está acessível.')
  }
  if (lines.length === 0 && !display.lastCheckedAt) {
    lines.push('Nenhuma análise concluída ainda. Use Analizar para verificar agora.')
  }

  if (display.lastCheckedAt) {
    lines.push(`Última verificação: ${formatCheckedAt(display.lastCheckedAt)}`)
  }

  return lines
}

export function ompsLanAccessHealthLabel(health: OmpsLanAccessHealth): string {
  if (health === 'ok') return 'Funcional'
  if (health === 'warn') return 'Verificando'
  return 'Indisponível'
}

/** Resumo simples para o painel Status (loja aberta / fechada). */
export function resolveOmpsLanAccessPlainSummary(state: OmpsContractAccessUiState): {
  headline: string
  hint: string
} {
  const health = resolveOmpsLanAccessHealth(state)
  if (health === 'ok') {
    return {
      headline: 'Loja aberta',
      hint: 'O Servidor OMPS está atendendo neste endereço. Pode usar o link ou o app Usuário OMPS.',
    }
  }
  if (state.analyzing) {
    return {
      headline: 'Análise em andamento',
      hint: 'Acompanhe a barra de progresso. A análise só termina quando o endereço responder, falhar ou você pausar.',
    }
  }
  return {
    headline: 'Loja fechada',
    hint: 'O endereço está certo, mas o serviço na porta 8080 ainda não responde. Toque em Analizar para retomar o motor embutido e testar.',
  }
}

/** Apresentação compacta no cabeçalho do dashboard (Servidor OMPS). */
export function resolveDashboardLanAccessView(state: OmpsContractAccessUiState): DashboardLanAccessView {
  if (state.phase === 'checking') {
    if (isOmpsShareableLoginUrl(state.loginUrl)) {
      return {
        displayUrl: state.loginUrl.trim(),
        statusLine: state.message.trim() || 'Verificando resposta HTTP do Usuário OMPS neste endereço…',
        tone: 'checking',
      }
    }
    return {
      displayUrl: null,
      statusLine: 'Determinando o endereço local do Usuário OMPS…',
      tone: 'checking',
    }
  }

  if (!isOmpsShareableLoginUrl(state.loginUrl)) {
    return {
      displayUrl: null,
      statusLine: formatLanAccessProblem(state),
      tone: 'unknown',
    }
  }

  const displayUrl = state.loginUrl.trim()
  if (state.phase === 'active') {
    return {
      displayUrl,
      statusLine: state.message.trim() || 'Serviço HTTP ativo neste endereço.',
      tone: 'ready',
    }
  }

  return {
    displayUrl,
    statusLine: state.message.trim() || 'Endereço LAN conhecido; o serviço HTTP ainda não está pronto.',
    tone: 'pending',
  }
}
