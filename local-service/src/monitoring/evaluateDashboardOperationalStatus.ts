import { collectRuntimeSummary } from '../runtime/systemProcessManager.ts'
import { getServerBootstrapStatus } from '../serverBootstrap/checkWindowsServerEnvironment.ts'
import { resolveBootstrapScriptDir } from '../serverBootstrap/resolveBootstrapScriptDir.ts'
import { listActiveAlerts } from './alertsEngine.ts'
import type { DashboardOperationalStatus, LiveMetricsSnapshot, OperationalHealthLevel } from './types.ts'

const LEVEL_RANK: Record<OperationalHealthLevel, number> = {
  operational: 0,
  attention: 1,
  degraded: 2,
  unavailable: 3,
  checking: 4,
}

function maxLevel(current: OperationalHealthLevel, next: OperationalHealthLevel): OperationalHealthLevel {
  return LEVEL_RANK[next] > LEVEL_RANK[current] ? next : current
}

function labelForLevel(level: OperationalHealthLevel): string {
  switch (level) {
    case 'operational':
      return 'Operacional'
    case 'attention':
      return 'Atenção'
    case 'degraded':
      return 'Degradado'
    case 'unavailable':
      return 'Indisponível'
    case 'checking':
      return 'Verificando'
  }
}

function solutionsForDetail(
  id: string,
  status: DashboardOperationalStatus['details'][number]['status'],
): string[] {
  if (status !== 'warn' && status !== 'fail') return []
  switch (id) {
    case 'bootstrap':
      return [
        'No Dashboard, abra o card Preparar este computador e conclua a preparação.',
        'Revise dependências (Docker, Git, WSL) no painel Servidor local.',
        'Instale ou corrija itens marcados como falha antes de instalar sistemas.',
      ]
    case 'dependencies':
      return [
        'No Dashboard, expanda Servidor local e siga o detalhe de cada dependência em falha.',
        'Execute o Manager como Administrador se algum item exigir privilégios elevados.',
        'Reinicie o Windows se uma dependência indicar necessidade de reboot.',
      ]
    case 'systems':
      return status === 'fail'
        ? [
            'Abra a aba Sistemas, selecione a instalação em erro e leia Último erro.',
            'Use Atualizar status, depois Iniciar ou Reiniciar.',
            'Confirme Docker/Supabase e Caddy (:8080) no painel Execução e acesso.',
          ]
        : [
            'Abra Sistemas, selecione o sistema instalado e use Iniciar agora ou Iniciar.',
            'Aguarde o badge Ativo em Acesso para usuários antes de partilhar o link.',
          ]
    case 'alerts':
      return [
        'Abra a aba Servidor e revise alertas de armazenamento ou hardware.',
        'Libere espaço no volume indicado ou mova backups antigos.',
        'Se o alerta persistir após correção, aguarde a próxima coleta (cerca de 1 min).',
      ]
    case 'metrics':
      return [
        'Feche todas as janelas do Manager e abra de novo pelo atalho.',
        'Confirme que o serviço local responde (porta 47831).',
        'Se CPU/RAM continuarem indisponíveis, reinicie o PC do servidor.',
      ]
    case 'overview':
      return [
        'Feche e reabra o Servidor Manager.',
        'Aguarde alguns segundos e clique de novo no card Status.',
      ]
    default:
      return ['Revise os painéis do Dashboard e da aba Sistemas para mais detalhe.']
  }
}

function pushDetail(
  details: DashboardOperationalStatus['details'],
  item: Omit<DashboardOperationalStatus['details'][number], 'solutions'>,
): void {
  details.push({
    ...item,
    solutions: solutionsForDetail(item.id, item.status),
  })
}

function summaryForLevel(level: OperationalHealthLevel): string {
  switch (level) {
    case 'operational':
      return 'Todos os componentes essenciais estão funcionando normalmente.'
    case 'attention':
      return 'Existe um aviso ou condição a acompanhar; o servidor continua operando.'
    case 'degraded':
      return 'Funcionalidade importante comprometida em pelo menos um componente.'
    case 'unavailable':
      return 'Função essencial indisponível ou sistema inacessível.'
    case 'checking':
      return 'Verificações em andamento para determinar a condição atual.'
  }
}

export async function evaluateDashboardOperationalStatus(
  live: LiveMetricsSnapshot,
): Promise<DashboardOperationalStatus> {
  const details: DashboardOperationalStatus['details'] = []
  let level: OperationalHealthLevel = 'operational'

  const bootstrapScriptAvailable = resolveBootstrapScriptDir() !== null
  const bootstrap = await getServerBootstrapStatus({ bootstrapScriptAvailable })
  if (!bootstrap.readyForManifestInstall) {
    pushDetail(details, {
      id: 'bootstrap',
      label: 'Preparação do servidor',
      status: 'warn',
      message: bootstrap.summary,
    })
    level = maxLevel(level, 'attention')
  } else {
    pushDetail(details, {
      id: 'bootstrap',
      label: 'Preparação do servidor',
      status: 'ok',
      message: 'Ambiente pronto para instalar sistemas (manifesto).',
    })
  }

  const failedDeps = bootstrap.dependencies.filter(
    (item) => item.critical && item.state !== 'ok' && item.state !== 'not_applicable',
  )
  if (failedDeps.length > 0) {
    const depHints = failedDeps
      .slice(0, 3)
      .map((d) => `${d.label}: ${d.detail}`)
      .join(' · ')
    pushDetail(details, {
      id: 'dependencies',
      label: 'Dependências',
      status: 'fail',
      message: `${failedDeps.length} dependência(s) em falha: ${failedDeps.map((d) => d.label).join(', ')}. ${depHints}`,
    })
    level = maxLevel(level, 'degraded')
  }

  const runtime = await collectRuntimeSummary()
  if (runtime.installed === 0) {
    pushDetail(details, {
      id: 'systems',
      label: 'Sistemas instalados',
      status: 'skip',
      message: 'Nenhuma instalação manifesto registrada no disco.',
    })
  } else if (runtime.error > 0) {
    pushDetail(details, {
      id: 'systems',
      label: 'Sistemas instalados',
      status: 'fail',
      message: `${runtime.error} sistema(s) em erro · ${runtime.running} em execução · ${runtime.stopped} parado(s).`,
    })
    level = maxLevel(level, 'degraded')
  } else if (runtime.running === 0) {
    pushDetail(details, {
      id: 'systems',
      label: 'Sistemas instalados',
      status: 'warn',
      message: `${runtime.installed} instalado(s), nenhum em execução neste momento.`,
    })
    level = maxLevel(level, 'attention')
  } else {
    pushDetail(details, {
      id: 'systems',
      label: 'Sistemas instalados',
      status: 'ok',
      message: `${runtime.running} em execução · ${runtime.stopped} parado(s) · ${runtime.installed} instalado(s).`,
    })
  }

  const alerts = await listActiveAlerts()
  const critical = alerts.filter((a) => a.severity === 'critical' && a.active)
  const warning = alerts.filter((a) => a.severity === 'warning' && a.active)
  if (critical.length > 0) {
    pushDetail(details, {
      id: 'alerts',
      label: 'Alertas de monitoramento',
      status: 'fail',
      message: critical.map((a) => `${a.title} — ${a.message}`).join(' · '),
    })
    level = maxLevel(level, 'unavailable')
  } else if (warning.length > 0) {
    pushDetail(details, {
      id: 'alerts',
      label: 'Alertas de monitoramento',
      status: 'warn',
      message: warning.map((a) => `${a.title} — ${a.message}`).join(' · '),
    })
    level = maxLevel(level, 'attention')
  } else {
    pushDetail(details, {
      id: 'alerts',
      label: 'Alertas de monitoramento',
      status: 'ok',
      message: 'Nenhum alerta ativo.',
    })
  }

  if (live.collectionError) {
    pushDetail(details, {
      id: 'metrics',
      label: 'Coleta de métricas',
      status: 'warn',
      message: live.collectionError,
    })
  } else if (live.cpuUsagePercent == null && live.memoryUsedPercent == null) {
    pushDetail(details, {
      id: 'metrics',
      label: 'Coleta de métricas',
      status: 'warn',
      message: 'CPU e memória indisponíveis neste ciclo.',
    })
    level = maxLevel(level, 'attention')
  } else {
    pushDetail(details, {
      id: 'metrics',
      label: 'Coleta de métricas',
      status: 'ok',
      message: `Última coleta: ${new Date(live.collectedAt).toLocaleString('pt-BR')}.`,
    })
  }

  return {
    level,
    label: labelForLevel(level),
    summary: summaryForLevel(level),
    details,
  }
}
