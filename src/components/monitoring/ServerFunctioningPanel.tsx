import { useEffect, useState } from 'react'
import { LiveMetricsCharts } from './LiveMetricsCharts.tsx'
import { useMonitoringLive } from '../../hooks/useMonitoringLive.ts'
import { HttpLocalManagerClient } from '../../services/httpLocalManagerClient.ts'
import type { HistorySample } from '../../types/monitoring.ts'

const client = new HttpLocalManagerClient()

type ServerFunctioningPanelProps = {
  active: boolean
}

export function ServerFunctioningPanel({ active }: ServerFunctioningPanelProps) {
  const { live, loading, error } = useMonitoringLive(active)
  const [history, setHistory] = useState<HistorySample[]>([])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    async function load() {
      try {
        const hist = await client.getMonitoringHistory('24h')
        if (!cancelled) setHistory(hist)
      } catch {
        if (!cancelled) setHistory([])
      }
    }
    void load()
    const id = window.setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [active])

  if (!active) return null

  return <LiveMetricsCharts live={live} history={history} loading={loading} error={error} />
}
