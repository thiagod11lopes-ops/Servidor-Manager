import type { ServerBootstrapStatus } from '../types/serverBootstrap.ts'
import type { ManagedSystem } from '../types/system.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'
import { isInvalidLanShareHost } from './lanShareUrl.ts'
import { resolveShareableLanUrl } from './systemAccessPanelDisplay.ts'

export type ChecklistItemStatus = 'done' | 'pending' | 'failed' | 'not_applicable'

export type ChecklistActionTarget =
  | 'dashboard_bootstrap'
  | 'analyze_install'
  | 'start_system'
  | 'refresh_runtime'

export type ChecklistItem = {
  id: string
  title: string
  status: ChecklistItemStatus
  detail: string
  action?: { label: string; target: ChecklistActionTarget }
}

export type ServerOperationalChecklistResult = {
  items: ChecklistItem[]
  lanEssentialsReady: boolean
  summary: string
}

export function buildServerOperationalChecklist(input: {
  bootstrapLoading: boolean
  bootstrapStatus: ServerBootstrapStatus | null
  system: ManagedSystem
  runtimeStatus: SystemRuntimeStatus | null | undefined
}): ServerOperationalChecklistResult {
  const { system, runtimeStatus } = input
  const items: ChecklistItem[] = []

  if (input.bootstrapLoading) {
    items.push({
      id: 'bootstrap',
      title: 'Preparação do computador',
      status: 'pending',
      detail: 'Verificando dependências do servidor…',
    })
  } else if (input.bootstrapStatus?.readyForManifestInstall) {
    items.push({
      id: 'bootstrap',
      title: 'Preparação do computador',
      status: 'done',
      detail: input.bootstrapStatus.summary || 'Pré-requisitos básicos verificados.',
    })
  } else if (input.bootstrapStatus && !input.bootstrapStatus.ok) {
    items.push({
      id: 'bootstrap',
      title: 'Preparação do computador',
      status: 'failed',
      detail: input.bootstrapStatus.summary || 'Dependências críticas pendentes.',
      action: { label: 'Abrir Dashboard → Preparar', target: 'dashboard_bootstrap' },
    })
  } else {
    items.push({
      id: 'bootstrap',
      title: 'Preparação do computador',
      status: 'pending',
      detail: 'Conclua o bootstrap antes de instalar o manifesto.',
      action: { label: 'Abrir Dashboard → Preparar', target: 'dashboard_bootstrap' },
    })
  }

  if (system.status === 'instalado') {
    items.push({
      id: 'installed',
      title: 'AcompSolemp instalado',
      status: 'done',
      detail: 'Instalação registrada neste Manager.',
    })
  } else if (system.status === 'erro_instalacao') {
    items.push({
      id: 'installed',
      title: 'AcompSolemp instalado',
      status: 'failed',
      detail: 'Última instalação falhou — revise o plano e os logs.',
      action: { label: 'Revisar análise e instalação', target: 'analyze_install' },
    })
  } else {
    items.push({
      id: 'installed',
      title: 'AcompSolemp instalado',
      status: 'pending',
      detail: 'Analise o repositório e conclua a instalação pelo manifesto.',
      action: { label: 'Ir para análise / instalação', target: 'analyze_install' },
    })
  }

  const state = runtimeStatus?.state
  if (system.status !== 'instalado') {
    items.push({
      id: 'running',
      title: 'Sistema em execução',
      status: 'not_applicable',
      detail: 'Disponível após a instalação.',
    })
  } else if (state === 'executando') {
    items.push({
      id: 'running',
      title: 'Sistema em execução',
      status: 'done',
      detail: 'Runtime reporta estado executando.',
    })
  } else if (state === 'erro') {
    items.push({
      id: 'running',
      title: 'Sistema em execução',
      status: 'failed',
      detail: runtimeStatus?.lastError || 'Runtime em erro.',
      action: { label: 'Ver execução e reiniciar', target: 'start_system' },
    })
  } else {
    items.push({
      id: 'running',
      title: 'Sistema em execução',
      status: 'pending',
      detail: state ? `Estado atual: ${state}.` : 'Inicie o sistema após instalar.',
      action: { label: 'Iniciar / atualizar execução', target: 'start_system' },
    })
  }

  const canProbeLocal =
    state === 'executando' &&
    Boolean(runtimeStatus?.loginUrl?.trim() || runtimeStatus?.lanAccessUrl?.trim())
  const localHttp = runtimeStatus?.localHttpReachable
  if (!canProbeLocal) {
    items.push({
      id: 'local_http',
      title: 'HTTP local (loopback)',
      status: 'not_applicable',
      detail: 'Aplicável com sistema executando e URL canônica disponível.',
      action: state !== 'executando' ? { label: 'Subir execução', target: 'start_system' } : undefined,
    })
  } else if (localHttp === true) {
    items.push({
      id: 'local_http',
      title: 'HTTP local (loopback)',
      status: 'done',
      detail:
        typeof runtimeStatus?.localHttpStatus === 'number'
          ? `Resposta HTTP ${runtimeStatus.localHttpStatus} em loopback (não é acesso remoto).`
          : 'Serviço respondeu em loopback.',
      action: { label: 'Atualizar execução', target: 'refresh_runtime' },
    })
  } else if (localHttp === false) {
    items.push({
      id: 'local_http',
      title: 'HTTP local (loopback)',
      status: 'failed',
      detail: 'Sem resposta HTTP em loopback — processo pode estar up sem Caddy/app.',
      action: { label: 'Atualizar execução', target: 'refresh_runtime' },
    })
  } else {
    items.push({
      id: 'local_http',
      title: 'HTTP local (loopback)',
      status: 'pending',
      detail: 'Ainda não verificado ou probe pendente.',
      action: { label: 'Atualizar execução', target: 'refresh_runtime' },
    })
  }

  const accessMode = runtimeStatus?.accessMode
  const shareableLan = runtimeStatus ? resolveShareableLanUrl(runtimeStatus) : null
  const rawLanUrl = runtimeStatus?.lanAccessUrl?.trim() ?? runtimeStatus?.loginUrl?.trim()
  let legacyVpnHost = false
  if (rawLanUrl) {
    try {
      legacyVpnHost = isInvalidLanShareHost(new URL(rawLanUrl).hostname)
    } catch {
      legacyVpnHost = false
    }
  }
  if (accessMode !== 'lan' || system.status !== 'instalado') {
    items.push({
      id: 'lan_share',
      title: 'Endereço na rede local (LAN)',
      status: 'not_applicable',
      detail: 'Aplicável com modo LAN e sistema instalado.',
    })
  } else if (state !== 'executando') {
    items.push({
      id: 'lan_share',
      title: 'Endereço na rede local (LAN)',
      status: 'pending',
      detail: 'Inicie o sistema para publicar o endereço LAN (Caddy).',
      action: { label: 'Iniciar sistema', target: 'start_system' },
    })
  } else if (legacyVpnHost) {
    items.push({
      id: 'lan_share',
      title: 'Endereço na rede local (LAN)',
      status: 'failed',
      detail:
        'Endereço legado (CGNAT ou rede virtual) ainda referenciado — use Atualizar execução para publicar o IPv4 Wi‑Fi/Ethernet.',
      action: { label: 'Atualizar execução', target: 'refresh_runtime' },
    })
  } else if (shareableLan) {
    items.push({
      id: 'lan_share',
      title: 'Endereço na rede local (LAN)',
      status: 'done',
      detail: `Use em telemóveis/PCs na mesma Wi‑Fi ou cabo: ${shareableLan}`,
    })
  } else {
    items.push({
      id: 'lan_share',
      title: 'Endereço na rede local (LAN)',
      status: 'pending',
      detail: 'URL LAN ainda não disponível — atualize a execução ou verifique Caddy/firewall.',
      action: { label: 'Atualizar execução', target: 'refresh_runtime' },
    })
  }

  const bootstrapOk = items.find((i) => i.id === 'bootstrap')?.status === 'done'
  const installedOk = items.find((i) => i.id === 'installed')?.status === 'done'
  const runningOk = items.find((i) => i.id === 'running')?.status === 'done'
  const localStatus = items.find((i) => i.id === 'local_http')?.status

  const lanEssentialsReady = Boolean(
    bootstrapOk &&
      installedOk &&
      runningOk &&
      (localStatus === 'done' ||
        (localStatus === 'not_applicable' && state !== 'executando')),
  )

  const summary = lanEssentialsReady
    ? 'Essencial pronto (bootstrap, instalação, execução e HTTP local). Para outros dispositivos na mesma rede, use o endereço LAN quando aplicável.'
    : 'Há pendências essenciais — siga os itens abaixo antes de considerar o servidor pronto.'

  return { items, lanEssentialsReady, summary }
}
