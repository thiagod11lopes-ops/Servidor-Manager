import { CpuIcon, MemoryIcon, PlayCircleIcon, SystemsIcon } from '../Icons.tsx'
import type { CpuMetrics, MemoryMetrics, ServerInstalledInventory } from '../../types/managerService.ts'

type DashboardKpiStripProps = {
  installedInventory: ServerInstalledInventory
  cpu: CpuMetrics
  memory: MemoryMetrics
  metricsReady: boolean
}

function isDemonstrativeDetail(detail: string): boolean {
  return detail.toLowerCase().includes('demonstrativo')
}

export function DashboardKpiStrip({ installedInventory, cpu, memory, metricsReady }: DashboardKpiStripProps) {
  const installedValue =
    !metricsReady && !installedInventory.confirmed
      ? '…'
      : installedInventory.confirmed
        ? String(installedInventory.summary.installed)
        : '—'

  const installedDetail = installedInventory.confirmed
    ? `${installedInventory.summary.stopped} parado(s) · ${installedInventory.summary.error} com erro`
    : installedInventory.message

  const runningValue =
    !metricsReady && !installedInventory.confirmed
      ? '…'
      : installedInventory.confirmed
        ? String(installedInventory.summary.running)
        : '—'

  const runningDetail = installedInventory.confirmed
    ? 'Disponíveis para utilizadores (execução activa)'
    : 'Aguardando inventário do disco'

  const cpuIsDemo = isDemonstrativeDetail(cpu.detail)
  const cpuValue =
    !metricsReady && cpuIsDemo ? '…' : cpuIsDemo ? '—' : cpu.displayValue

  const memoryIsDemo = isDemonstrativeDetail(memory.detail)
  const memoryValue =
    !metricsReady && memoryIsDemo ? '…' : memoryIsDemo ? '—' : `${memory.usagePercent}%`

  return (
    <div className="dashboard-kpi-grid" aria-label="Indicadores principais">
      <article className="dashboard-kpi-card">
        <div className="dashboard-kpi-icon" aria-hidden>
          <SystemsIcon />
        </div>
        <p className="dashboard-kpi-label">Sistemas instalados</p>
        <p className="dashboard-kpi-value">{installedValue}</p>
        <p className="dashboard-kpi-detail">{installedDetail}</p>
      </article>
      <article className="dashboard-kpi-card">
        <div className="dashboard-kpi-icon" aria-hidden>
          <PlayCircleIcon />
        </div>
        <p className="dashboard-kpi-label">Em execução</p>
        <p className="dashboard-kpi-value">{runningValue}</p>
        <p className="dashboard-kpi-detail">{runningDetail}</p>
      </article>
      <article className="dashboard-kpi-card">
        <div className="dashboard-kpi-icon" aria-hidden>
          <CpuIcon />
        </div>
        <p className="dashboard-kpi-label">CPU</p>
        <p className="dashboard-kpi-value">{cpuValue}</p>
        <p className="dashboard-kpi-detail">
          {cpuIsDemo ? `${cpu.detail} — aguardando coleta real` : cpu.detail}
        </p>
      </article>
      <article className="dashboard-kpi-card">
        <div className="dashboard-kpi-icon" aria-hidden>
          <MemoryIcon />
        </div>
        <p className="dashboard-kpi-label">Memória RAM</p>
        <p className="dashboard-kpi-value">{memoryValue}</p>
        <p className="dashboard-kpi-detail">
          {memoryIsDemo ? `${memory.detail} — aguardando coleta real` : memory.detail}
        </p>
      </article>
    </div>
  )
}
