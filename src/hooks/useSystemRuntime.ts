import { useCallback, useState } from 'react'
import { localManagerService } from '../services/index.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'
import { normalizeRuntimeStatusForUi } from '../utils/systemAccessPanelDisplay.ts'
import { isFixedLanPort8080LifecycleFailure } from '../utils/fixedLanPort8080Runtime.ts'

export type RuntimeUiPhase = 'idle' | 'loading' | 'refreshing' | 'error' | 'success'

export type RuntimeUiState = {
  phase: RuntimeUiPhase
  status?: SystemRuntimeStatus
  error?: string
  actionMessage?: string
  fixedLanPort8080ConflictOpen?: boolean
}

type Bootstrap = { systemId: string; status?: SystemRuntimeStatus }

export function useSystemRuntime(bootstrap: Bootstrap[]) {
  const [states, setStates] = useState<Record<string, RuntimeUiState>>(() => {
    const initial: Record<string, RuntimeUiState> = {}
    for (const item of bootstrap) {
      initial[item.systemId] = {
        phase: item.status ? 'success' : 'idle',
        status: item.status,
      }
    }
    return initial
  })

  const getState = useCallback((systemId: string): RuntimeUiState => {
    return states[systemId] ?? { phase: 'idle' }
  }, [states])

  const applyStatus = useCallback((systemId: string, status: SystemRuntimeStatus | undefined, extra?: Partial<RuntimeUiState>) => {
    const normalized = status ? normalizeRuntimeStatusForUi(status) : undefined
    setStates((prev) => ({
      ...prev,
      [systemId]: {
        phase: 'success',
        status: normalized,
        ...extra,
      },
    }))
    return normalized
  }, [])

  const refreshStatus = useCallback(async (systemId: string) => {
    setStates((prev) => ({
      ...prev,
      [systemId]: { ...prev[systemId], phase: 'refreshing', error: undefined },
    }))

    const response = await localManagerService.getSystemRuntimeStatus(systemId)
    if (!response.ok) {
      setStates((prev) => ({
        ...prev,
        [systemId]: {
          phase: 'error',
          error: response.message,
          status: response.status ?? prev[systemId]?.status,
        },
      }))
      return response.status
    }

    return applyStatus(systemId, response.status)
  }, [applyStatus])

  const runLifecycle = useCallback(
    async (systemId: string, action: 'start' | 'stop' | 'restart') => {
      setStates((prev) => ({
        ...prev,
        [systemId]: { ...prev[systemId], phase: 'loading', error: undefined, actionMessage: undefined },
      }))

      const result =
        action === 'start'
          ? await localManagerService.startSystem(systemId)
          : action === 'stop'
            ? await localManagerService.stopSystem(systemId)
            : await localManagerService.restartSystem(systemId)

      const portConflictOpen = !result.ok && isFixedLanPort8080LifecycleFailure(result)

      if (result.status) {
        applyStatus(systemId, result.status, {
          phase: result.ok ? 'success' : 'error',
          error: result.ok ? undefined : result.message,
          actionMessage: result.message,
          fixedLanPort8080ConflictOpen: portConflictOpen,
        })
        return result
      }

      setStates((prev) => ({
        ...prev,
        [systemId]: {
          phase: result.ok ? 'success' : 'error',
          error: result.ok ? undefined : result.message,
          actionMessage: result.message,
          status: prev[systemId]?.status,
          fixedLanPort8080ConflictOpen: portConflictOpen,
        },
      }))

      return result
    },
    [applyStatus],
  )

  const dismissFixedLanPort8080Conflict = useCallback((systemId: string) => {
    setStates((prev) => ({
      ...prev,
      [systemId]: {
        ...prev[systemId],
        fixedLanPort8080ConflictOpen: false,
      },
    }))
  }, [])

  return {
    getState,
    refreshStatus,
    dismissFixedLanPort8080Conflict,
    start: (systemId: string) => runLifecycle(systemId, 'start'),
    stop: (systemId: string) => runLifecycle(systemId, 'stop'),
    restart: (systemId: string) => runLifecycle(systemId, 'restart'),
  }
}
