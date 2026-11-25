import { useCallback, useState } from 'react'
import { localManagerService } from '../services/index.ts'
import type { SystemServiceStatus } from '../types/systemService.ts'

export type ServiceUiPhase =
  | 'idle'
  | 'loading'
  | 'installing'
  | 'starting'
  | 'stopping'
  | 'restarting'
  | 'removing'
  | 'error'
  | 'success'

export type ServiceUiState = {
  phase: ServiceUiPhase
  status?: SystemServiceStatus
  error?: string
  message?: string
}

type Bootstrap = { systemId: string; status?: SystemServiceStatus }

export function useSystemService(bootstrap: Bootstrap[]) {
  const [states, setStates] = useState<Record<string, ServiceUiState>>(() => {
    const initial: Record<string, ServiceUiState> = {}
    for (const item of bootstrap) {
      initial[item.systemId] = {
        phase: item.status ? 'success' : 'idle',
        status: item.status,
      }
    }
    return initial
  })

  const getState = useCallback((systemId: string) => states[systemId] ?? { phase: 'idle' }, [states])

  const apply = useCallback((systemId: string, status: SystemServiceStatus, extra?: Partial<ServiceUiState>) => {
    setStates((prev) => ({
      ...prev,
      [systemId]: { phase: 'success', status, ...extra },
    }))
    return status
  }, [])

  const refresh = useCallback(async (systemId: string) => {
    setStates((prev) => ({
      ...prev,
      [systemId]: { ...prev[systemId], phase: 'loading', error: undefined },
    }))
    const response = await localManagerService.getSystemServiceStatus(systemId)
    return apply(systemId, response)
  }, [apply])

  const run = useCallback(
    async (
      systemId: string,
      phase: ServiceUiPhase,
      action: () => Promise<{ ok: boolean; message?: string; status?: SystemServiceStatus }>,
    ) => {
      setStates((prev) => ({
        ...prev,
        [systemId]: { ...prev[systemId], phase, error: undefined, message: undefined },
      }))
      const result = await action()
      if (result.status) {
        apply(systemId, result.status, {
          phase: result.ok ? 'success' : 'error',
          error: result.ok ? undefined : result.message,
          message: result.ok ? result.message : undefined,
        })
      } else {
        setStates((prev) => ({
          ...prev,
          [systemId]: { ...prev[systemId], phase: 'error', error: result.message },
        }))
      }
      return result
    },
    [apply],
  )

  return {
    getState,
    refresh,
    install: (systemId: string, automaticStartup: boolean) =>
      run(systemId, 'installing', () =>
        localManagerService.installSystemService(systemId, automaticStartup),
      ),
    uninstall: (systemId: string) =>
      run(systemId, 'removing', () => localManagerService.uninstallSystemService(systemId)),
    start: (systemId: string) =>
      run(systemId, 'starting', () => localManagerService.startSystemService(systemId)),
    stop: (systemId: string) =>
      run(systemId, 'stopping', () => localManagerService.stopSystemService(systemId)),
    restart: (systemId: string) =>
      run(systemId, 'restarting', () => localManagerService.restartSystemService(systemId)),
    setAutomaticStartup: (systemId: string, enabled: boolean) =>
      run(systemId, 'loading', () =>
        localManagerService.setSystemServiceStartup(systemId, enabled),
      ),
  }
}
