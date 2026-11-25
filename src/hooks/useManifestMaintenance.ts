import { useCallback, useState } from 'react'
import { localManagerService } from '../services/index.ts'

export type ManifestMaintenanceUiState = {
  phase: 'idle' | 'loading'
  message?: string
  error?: string
}

export function useManifestMaintenance() {
  const [states, setStates] = useState<Record<string, ManifestMaintenanceUiState>>({})

  const getState = useCallback(
    (systemId: string): ManifestMaintenanceUiState => states[systemId] ?? { phase: 'idle' },
    [states],
  )

  const runBackup = useCallback(async (systemId: string) => {
    setStates((current) => ({ ...current, [systemId]: { phase: 'loading' } }))
    const response = await localManagerService.runManifestBackup(systemId)
    setStates((current) => ({
      ...current,
      [systemId]: response.ok
        ? { phase: 'idle', message: response.message }
        : { phase: 'idle', error: response.message },
    }))
    return response
  }, [])

  const runUpdate = useCallback(async (systemId: string, skipBackup: boolean) => {
    setStates((current) => ({ ...current, [systemId]: { phase: 'loading' } }))
    const response = await localManagerService.runManifestUpdate(systemId, { skipBackup })
    setStates((current) => ({
      ...current,
      [systemId]: response.ok
        ? { phase: 'idle', message: response.message }
        : { phase: 'idle', error: response.message },
    }))
    return response
  }, [])

  return { getState, runBackup, runUpdate }
}
