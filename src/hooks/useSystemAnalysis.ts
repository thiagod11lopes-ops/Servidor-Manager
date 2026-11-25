import { useCallback, useState } from 'react'
import { localManagerService } from '../services/index.ts'
import type { ProjectSourceInput } from '../types/projectSource.ts'
import type { SystemAnalysisResult } from '../types/systemAnalysis.ts'

export type SystemAnalysisUiState =
  | { phase: 'idle'; result?: SystemAnalysisResult; error?: undefined }
  | { phase: 'loading'; result?: SystemAnalysisResult; error?: undefined }
  | { phase: 'success'; result: SystemAnalysisResult; error?: undefined }
  | { phase: 'error'; result?: SystemAnalysisResult; error: string }

type InitialAnalysisState = {
  systemId: string
  result?: SystemAnalysisResult
}

export function useSystemAnalysis(initialStates: InitialAnalysisState[]) {
  const [states, setStates] = useState<Record<string, SystemAnalysisUiState>>(() => {
    const map: Record<string, SystemAnalysisUiState> = {}
    for (const item of initialStates) {
      if (item.result) {
        map[item.systemId] = { phase: 'success', result: item.result }
      }
    }
    return map
  })

  const getState = useCallback(
    (systemId: string): SystemAnalysisUiState => states[systemId] ?? { phase: 'idle' },
    [states],
  )

  const analyze = useCallback(async (systemId: string, source: ProjectSourceInput | string) => {
    setStates((current) => ({
      ...current,
      [systemId]: { phase: 'loading', result: current[systemId]?.result },
    }))

    const response = await localManagerService.analyzeSystem(source)

    if (!response.ok) {
      setStates((current) => ({
        ...current,
        [systemId]: { phase: 'error', error: response.message, result: current[systemId]?.result },
      }))
      return null
    }

    setStates((current) => ({
      ...current,
      [systemId]: { phase: 'success', result: response.result },
    }))

    return response.result
  }, [])

  return { getState, analyze }
}
