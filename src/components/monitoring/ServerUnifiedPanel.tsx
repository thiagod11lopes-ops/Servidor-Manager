import { useEffect, useMemo, useState } from 'react'
import { CollapsibleSection } from '../CollapsibleSection.tsx'
import { LiveMetricsCharts } from './LiveMetricsCharts.tsx'
import { MonitoringAlertsPanel } from './MonitoringAlertsPanel.tsx'
import { StorageVolumeKpis } from './StorageVolumeKpis.tsx'
import { SystemStorageTable } from './SystemStorageTable.tsx'
import { useMonitoringLive } from '../../hooks/useMonitoringLive.ts'
import { HttpLocalManagerClient } from '../../services/httpLocalManagerClient.ts'
import { loadSystems } from '../../storage/systemsStorage.ts'
import type { AcompStorageDetail, HistorySample, MonitoringAlert, SystemStorageRow } from '../../types/monitoring.ts'
import { AcompCategoriesBarChart } from './charts/AcompCategoriesBarChart.tsx'
import { StorageHistoryLineChart } from './charts/StorageHistoryLineChart.tsx'
import { StorageVolumeDonut } from './charts/StorageVolumeDonut.tsx'
import { VolumeStackedBars } from './charts/VolumeStackedBars.tsx'

const client = new HttpLocalManagerClient()

type ServerUnifiedPanelProps = {
  focusSystemId?: string | null
  onNavigateUsers: (systemId: string) => void
  onFocusSystem?: (systemId: string) => void
}

export function ServerUnifiedPanel({
  focusSystemId,
  onNavigateUsers,
  onFocusSystem,
}: ServerUnifiedPanelProps) {
  const { live, loading: liveLoading, error: liveError } = useMonitoringLive(true)
  const [history, setHistory] = useState<HistorySample[]>([])
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([])
  const [systems, setSystems] = useState<SystemStorageRow[]>([])
  const [storageLoading, setStorageLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [acompsolemp, setAcompsolemp] = useState<AcompStorageDetail | null>(null)
  const [acompsolempError, setAcompsolempError] = useState<string | null>(null)

  const primary = live?.volumes[0]
  const extraVolumes = live?.volumes.slice(1) ?? []

  const nameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of loadSystems()) {
      if (s.id) map[s.id] = s.name
    }
    return map
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [hist, alertList, systemRows] = await Promise.all([
          client.getMonitoringHistory('24h'),
          client.getMonitoringAlerts(),
          client.getMonitoringSystemStorage(),
        ])
        if (cancelled) return
        setHistory(hist)
        setAlerts(alertList)
        setSystems(systemRows)
        setStorageError(null)
      } catch (error) {
        if (!cancelled) {
          setStorageError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!cancelled) setStorageLoading(false)
      }
    }
    void load()
    const id = window.setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (!focusSystemId) {
      setAcompsolemp(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const detail = await client.getAcompStorageDetail(focusSystemId)
        if (!cancelled) {
          setAcompsolemp(detail)
          setAcompsolempError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setAcompsolemp(null)
          setAcompsolempError(error instanceof Error ? error.message : String(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [focusSystemId])

  const acompTitle =
    focusSystemId && nameById[focusSystemId]
      ? `Detalhamento — ${nameById[focusSystemId]} (AcompSolemp)`
      : 'Detalhamento do sistema selecionado (AcompSolemp)'

  const collectedLabel =
    live?.collectedAt != null ? new Date(live.collectedAt).toLocaleString('pt-BR') : null

  return (
    <div className="server-unified-layout">
      <div className="server-unified-status">
        {(liveLoading || storageLoading) && <span className="badge badge-mock">Coletando…</span>}
        {liveError ? <span className="badge badge-mock">Live indisponível</span> : null}
        {collectedLabel ? (
          <span className="analysis-meta server-collected-at">Última coleta: {collectedLabel}</span>
        ) : null}
      </div>

      <div className="server-unified-top server-grid-row">
        <LiveMetricsCharts live={live} history={history} loading={liveLoading} error={liveError} part="strip" />
        <StorageVolumeKpis volume={primary} />
      </div>

      <div className="server-unified-center server-grid-row">
        <section
          className="analysis-panel monitoring-panel server-subpanel server-hardware-panel"
          aria-labelledby="server-hardware-title"
        >
          <div className="analysis-header">
            <p id="server-hardware-title" className="analysis-title">
              Monitoramento de Hardware
            </p>
          </div>
          <LiveMetricsCharts live={live} history={history} loading={liveLoading} error={liveError} part="sparklines" />
        </section>
        <section className="analysis-panel monitoring-panel server-subpanel server-donut-panel" aria-label="Distribuição de armazenamento">
          <div className="analysis-header">
            <p className="analysis-title">Volume principal</p>
          </div>
          {liveError ? <p className="field-error">Armazenamento: {liveError}</p> : null}
          {primary ? (
            <>
              <StorageVolumeDonut volume={primary} compact />
              {primary.detail ? (
                <p className="analysis-disclaimer storage-volume-detail-compact">{primary.detail}</p>
              ) : null}
              {extraVolumes.length > 0 ? (
                <CollapsibleSection title={`Comparativo por volume (${extraVolumes.length + 1})`} defaultOpen={false}>
                  <VolumeStackedBars volumes={[primary, ...extraVolumes]} compact />
                </CollapsibleSection>
              ) : null}
            </>
          ) : (
            <div className="storage-chart-empty storage-chart-empty-compact">
              <p>{liveLoading ? 'Carregando armazenamento…' : 'Aguardando primeira coleta.'}</p>
            </div>
          )}
        </section>
      </div>

      <div className="server-unified-bottom server-grid-row">
        <SystemStorageTable
          rows={systems}
          nameById={nameById}
          loading={storageLoading}
          error={storageError}
          compact
          onOpenAcomp={(systemId) => onFocusSystem?.(systemId)}
          onOpenUsers={onNavigateUsers}
        />
        <section className="analysis-panel monitoring-panel server-subpanel server-history-panel" aria-labelledby="storage-history-title">
          <div className="analysis-header">
            <p id="storage-history-title" className="analysis-title">
              Histórico de utilização
            </p>
          </div>
          <StorageHistoryLineChart samples={history} compact />
        </section>
        <MonitoringAlertsPanel alerts={alerts} loading={storageLoading} error={storageError} compact />
      </div>

      {acompsolemp ? (
        <section className="analysis-panel monitoring-panel server-subpanel server-acomp-panel">
          <CollapsibleSection title={acompTitle} defaultOpen>
            <div className="server-acomp-detail">
              <div className="analysis-header server-acomp-header">
                <span className="badge badge-plan">{acompsolemp.profile}</span>
              </div>
              <AcompCategoriesBarChart detail={acompsolemp} compact />
              <p className="analysis-disclaimer">
                Total identificado: {acompsolemp.totalIdentified.label ?? 'Indisponível'} —{' '}
                {acompsolemp.totalIdentified.detail}
              </p>
              {acompsolemp.notes.map((note) => (
                <p key={note} className="analysis-disclaimer">
                  {note}
                </p>
              ))}
            </div>
          </CollapsibleSection>
        </section>
      ) : null}
      {acompsolempError ? <p className="field-error">{acompsolempError}</p> : null}
    </div>
  )
}
