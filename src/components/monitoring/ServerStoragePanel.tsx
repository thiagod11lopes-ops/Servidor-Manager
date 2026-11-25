import { useEffect, useMemo, useState } from 'react'
import { CollapsibleSection } from '../CollapsibleSection.tsx'
import { MonitoringAlertsPanel } from './MonitoringAlertsPanel.tsx'
import { StorageServerPanel } from './StorageServerPanel.tsx'
import { SystemStorageTable } from './SystemStorageTable.tsx'
import { useMonitoringLive } from '../../hooks/useMonitoringLive.ts'
import { HttpLocalManagerClient } from '../../services/httpLocalManagerClient.ts'
import { loadSystems } from '../../storage/systemsStorage.ts'
import type { AcompStorageDetail, HistorySample, MonitoringAlert, SystemStorageRow } from '../../types/monitoring.ts'
import { AcompCategoriesBarChart } from './charts/AcompCategoriesBarChart.tsx'
import { StorageHistoryLineChart } from './charts/StorageHistoryLineChart.tsx'

const client = new HttpLocalManagerClient()

type ServerStoragePanelProps = {
  active: boolean
  focusSystemId?: string | null
  onNavigateUsers: (systemId: string) => void
  onFocusSystem?: (systemId: string) => void
}

export function ServerStoragePanel({
  active,
  focusSystemId,
  onNavigateUsers,
  onFocusSystem,
}: ServerStoragePanelProps) {
  const { live, loading: liveLoading, error: liveError } = useMonitoringLive(active)
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([])
  const [systems, setSystems] = useState<SystemStorageRow[]>([])
  const [storageLoading, setStorageLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [acompsolemp, setAcompsolemp] = useState<AcompStorageDetail | null>(null)
  const [acompsolempError, setAcompsolempError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistorySample[]>([])

  const nameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of loadSystems()) {
      if (s.id) map[s.id] = s.name
    }
    return map
  }, [])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    async function load() {
      try {
        const [alertList, systemRows, hist] = await Promise.all([
          client.getMonitoringAlerts(),
          client.getMonitoringSystemStorage(),
          client.getMonitoringHistory('24h'),
        ])
        if (cancelled) return
        setAlerts(alertList)
        setSystems(systemRows)
        setHistory(hist)
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
  }, [active])

  useEffect(() => {
    if (!active || !focusSystemId) {
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
  }, [active, focusSystemId])

  if (!active) return null

  const acompTitle =
    focusSystemId && nameById[focusSystemId]
      ? `Detalhamento — ${nameById[focusSystemId]} (AcompSolemp)`
      : 'Detalhamento do sistema selecionado (AcompSolemp)'

  return (
    <div className="server-storage-layout">
      <div className="server-storage-top">
        <StorageServerPanel live={live} loading={liveLoading} error={liveError} compact />
        <section className="analysis-panel monitoring-panel server-subpanel server-history-panel" aria-labelledby="storage-history-title">
          <div className="analysis-header">
            <p id="storage-history-title" className="analysis-title">
              Histórico de utilização
            </p>
          </div>
          <StorageHistoryLineChart samples={history} compact />
        </section>
      </div>

      <div className="server-storage-mid">
        <SystemStorageTable
          rows={systems}
          nameById={nameById}
          loading={storageLoading}
          error={storageError}
          compact
          onOpenAcomp={(systemId) => onFocusSystem?.(systemId)}
          onOpenUsers={onNavigateUsers}
        />
        <MonitoringAlertsPanel alerts={alerts} loading={storageLoading} error={storageError} compact />
      </div>

      {acompsolemp ? (
        <section className="analysis-panel monitoring-panel server-subpanel">
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
