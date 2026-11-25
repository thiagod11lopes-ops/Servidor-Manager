import { useCallback, useEffect, useState } from 'react'
import { HttpLocalManagerClient } from '../services/httpLocalManagerClient.ts'
import type { LiveMetricsSnapshot } from '../types/monitoring.ts'

const client = new HttpLocalManagerClient()

type MonitoringLiveState = {
  live: LiveMetricsSnapshot | null
  loading: boolean
  error: string | null
}

export function useMonitoringLive(enabled: boolean, intervalMs = 5000) {
  const [state, setState] = useState<MonitoringLiveState>({
    live: null,
    loading: enabled,
    error: null,
  })

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const live = await client.getMonitoringLive()
      setState({ live, loading: false, error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState((prev) => ({
        live: prev.live,
        loading: false,
        error: message,
      }))
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setState({ live: null, loading: false, error: null })
      return
    }
    void refresh()
    const id = window.setInterval(() => void refresh(), intervalMs)
    return () => window.clearInterval(id)
  }, [enabled, intervalMs, refresh])

  return { ...state, refresh }
}
