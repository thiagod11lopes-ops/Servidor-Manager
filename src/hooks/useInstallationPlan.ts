import { useCallback, useState } from 'react'
import { localManagerService } from '../services/index.ts'
import type { InstallationPlan } from '../types/installationPlan.ts'
import type { ProjectSourceInput } from '../types/projectSource.ts'
import type { SystemAnalysisResult } from '../types/systemAnalysis.ts'

export type InstallationPlanUiState =
  | { phase: 'idle'; visible: boolean; plan?: InstallationPlan; error?: undefined }
  | { phase: 'loading'; visible: boolean; plan?: InstallationPlan; error?: undefined }
  | { phase: 'success'; visible: boolean; plan: InstallationPlan; error?: undefined }
  | { phase: 'error'; visible: boolean; plan?: InstallationPlan; error: string }

type BootstrapItem = {
  systemId: string
  plan?: InstallationPlan
}

export function useInstallationPlan(initialItems: BootstrapItem[]) {
  const [states, setStates] = useState<Record<string, InstallationPlanUiState>>(() => {
    const map: Record<string, InstallationPlanUiState> = {}
    for (const item of initialItems) {
      if (item.plan) {
        map[item.systemId] = { phase: 'success', visible: false, plan: item.plan }
      }
    }
    return map
  })

  const getState = useCallback(
    (systemId: string): InstallationPlanUiState =>
      states[systemId] ?? { phase: 'idle', visible: false },
    [states],
  )

  const requestPlan = useCallback(
    async (systemId: string, source: ProjectSourceInput | string, analysis?: SystemAnalysisResult) => {
      setStates((current) => ({
        ...current,
        [systemId]: {
          phase: 'loading',
          visible: true,
          plan: current[systemId]?.plan,
        },
      }))

      const response = await localManagerService.getInstallationPlan(source, analysis, systemId)

      if (!response.ok) {
        setStates((current) => ({
          ...current,
          [systemId]: {
            phase: 'error',
            visible: true,
            error: response.message,
            plan: current[systemId]?.plan,
          },
        }))
        return null
      }

      setStates((current) => ({
        ...current,
        [systemId]: { phase: 'success', visible: true, plan: response.plan },
      }))

      return response.plan
    },
    [],
  )

  return { getState, requestPlan }
}
