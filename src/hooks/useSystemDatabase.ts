import { useCallback, useState } from 'react'
import { localManagerService } from '../services/index.ts'
import type {
  DatabaseHostStatus,
  PostgresAdminCredentialsInput,
  SystemDatabaseAnalysis,
} from '../types/database.ts'
import type { InstallationPlanDatabase } from '../types/database.ts'

export type DatabaseUiState = {
  phase: 'idle' | 'loading' | 'provisioning' | 'error' | 'success'
  host?: DatabaseHostStatus
  analysis?: SystemDatabaseAnalysis
  error?: string
  actionMessage?: string
}

type Bootstrap = {
  systemId: string
  planDatabase?: InstallationPlanDatabase
  analysis?: SystemDatabaseAnalysis
}

export function useSystemDatabase(bootstrap: Bootstrap[]) {
  const [states, setStates] = useState<Record<string, DatabaseUiState>>(() => {
    const initial: Record<string, DatabaseUiState> = {}
    for (const item of bootstrap) {
      initial[item.systemId] = {
        phase: item.analysis ? 'success' : 'idle',
        analysis: item.analysis,
      }
    }
    return initial
  })

  const getState = useCallback(
    (systemId: string): DatabaseUiState => states[systemId] ?? { phase: 'idle' },
    [states],
  )

  const refreshHost = useCallback(async () => {
    try {
      const host = await localManagerService.getDatabaseHostStatus()
      setStates((prev) => {
        const next = { ...prev }
        for (const key of Object.keys(next)) {
          next[key] = { ...next[key], host }
        }
        return next
      })
      return host
    } catch {
      return undefined
    }
  }, [])

  const analyzeInstalled = useCallback(async (systemId: string) => {
    setStates((prev) => ({
      ...prev,
      [systemId]: { ...prev[systemId], phase: 'loading', error: undefined },
    }))

    const response = await localManagerService.analyzeSystemDatabase(systemId)
    if (!response.ok) {
      setStates((prev) => ({
        ...prev,
        [systemId]: { ...prev[systemId], phase: 'error', error: response.message },
      }))
      return undefined
    }

    setStates((prev) => ({
      ...prev,
      [systemId]: {
        phase: 'success',
        analysis: response.analysis,
        host: response.analysis.host,
      },
    }))

    return response.analysis
  }, [])

  const provision = useCallback(async (systemId: string, admin: PostgresAdminCredentialsInput) => {
    setStates((prev) => ({
      ...prev,
      [systemId]: {
        ...prev[systemId],
        phase: 'provisioning',
        error: undefined,
        actionMessage: undefined,
      },
    }))

    const response = await localManagerService.provisionSystemDatabase(systemId, admin)
    const analysis = 'analysis' in response ? response.analysis : undefined
    if (analysis) {
      setStates((prev) => ({
        ...prev,
        [systemId]: {
          phase: response.ok ? 'success' : 'error',
          analysis,
          host: analysis.host,
          error: response.ok ? undefined : response.message,
          actionMessage: response.ok ? response.message : undefined,
        },
      }))
    } else {
      setStates((prev) => ({
        ...prev,
        [systemId]: {
          ...prev[systemId],
          phase: 'error',
          error: response.message,
        },
      }))
    }

    return response
  }, [])

  return { getState, refreshHost, analyzeInstalled, provision }
}
