import { useCallback, useRef, useState } from 'react'
import { localManagerService } from '../services/index.ts'
import type { InstallationPlan } from '../types/installationPlan.ts'
import type { InstallationProgressSnapshot } from '../types/installationProgress.ts'
import type { InstallationResult } from '../types/installationResult.ts'
import type { ProjectSourceInput } from '../types/projectSource.ts'
import { installRequestFromSource } from '../types/projectSource.ts'
import type { SystemAccessMode } from '../types/systemAccessMode.ts'

export type InstallationUiState =
  | { phase: 'idle'; result?: InstallationResult; error?: undefined }
  | { phase: 'loading'; result?: InstallationResult; error?: undefined }
  | { phase: 'awaiting_docker'; result?: InstallationResult; error?: undefined }
  | { phase: 'success'; result: InstallationResult; error?: undefined }
  | { phase: 'error'; result?: InstallationResult; error: string }

type BootstrapItem = {
  systemId: string
  result?: InstallationResult
}

const PROGRESS_POLL_MS = 800

function isPausedInstallResponse(
  response: Awaited<ReturnType<typeof localManagerService.installProject>>,
): response is { ok: false; paused: true; code: 'DOCKER_AWAITING'; message: string } {
  return response.ok === false && 'paused' in response && response.paused === true
}

export function useSystemInstallation(initialItems: BootstrapItem[]) {
  const [states, setStates] = useState<Record<string, InstallationUiState>>(() => {
    const map: Record<string, InstallationUiState> = {}
    for (const item of initialItems) {
      if (!item.result) continue
      map[item.systemId] = item.result.ok
        ? { phase: 'success', result: item.result }
        : {
            phase: 'error',
            result: item.result,
            error: item.result.error ?? 'Instalação não concluída.',
          }
    }
    return map
  })

  const [progressBySystemId, setProgressBySystemId] = useState<
    Record<string, InstallationProgressSnapshot | null | undefined>
  >({})

  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const installContextRef = useRef<
    Map<
      string,
      {
        source: ProjectSourceInput
        installationPlan: InstallationPlan
        accessMode: SystemAccessMode
        overlayEnabled?: boolean
        lanHost?: string
      }
    >
  >(new Map())

  const stopProgressPolling = useCallback((systemId: string) => {
    const timer = pollTimersRef.current.get(systemId)
    if (timer) {
      clearInterval(timer)
      pollTimersRef.current.delete(systemId)
    }
  }, [])

  const refreshProgress = useCallback(async (systemId: string) => {
    try {
      const response = await localManagerService.getInstallationProgress(systemId)
      if (response.ok) {
        setProgressBySystemId((current) => {
          const previous = current[systemId]
          const next = response.progress
          if (
            previous &&
            next &&
            previous.status === 'running' &&
            next.status === 'running' &&
            next.percent < previous.percent
          ) {
            return { ...current, [systemId]: { ...next, percent: previous.percent } }
          }
          return { ...current, [systemId]: next }
        })
      }
    } catch {
      // local-service offline — modal keeps last snapshot
    }
  }, [])

  const startProgressPolling = useCallback(
    (systemId: string) => {
      stopProgressPolling(systemId)
      void refreshProgress(systemId)
      const timer = setInterval(() => {
        void refreshProgress(systemId)
      }, PROGRESS_POLL_MS)
      pollTimersRef.current.set(systemId, timer)
    },
    [refreshProgress, stopProgressPolling],
  )

  const getState = useCallback(
    (systemId: string): InstallationUiState => states[systemId] ?? { phase: 'idle' },
    [states],
  )

  const getProgress = useCallback(
    (systemId: string): InstallationProgressSnapshot | null | undefined =>
      progressBySystemId[systemId],
    [progressBySystemId],
  )

  const runInstallRequest = useCallback(
    async (
      systemId: string,
      source: ProjectSourceInput,
      installationPlan: InstallationPlan,
      options: {
        accessMode: SystemAccessMode
        overlayEnabled?: boolean
        lanHost?: string
        resumeAfterDocker?: boolean
      },
    ) => {
      if (!options.resumeAfterDocker) {
        setStates((current) => ({
          ...current,
          [systemId]: { phase: 'loading', result: current[systemId]?.result },
        }))
        startProgressPolling(systemId)
        installContextRef.current.set(systemId, {
          source,
          installationPlan,
          accessMode: options.accessMode,
          overlayEnabled: options.overlayEnabled,
          lanHost: options.lanHost,
        })
      } else {
        setStates((current) => ({
          ...current,
          [systemId]: { phase: 'loading', result: current[systemId]?.result },
        }))
        startProgressPolling(systemId)
      }

      try {
        const response = await localManagerService.installProject({
          systemId,
          ...installRequestFromSource(source),
          installationPlan,
          accessMode: options.accessMode,
          lanHost: options.lanHost,
          overlayEnabled: options.overlayEnabled,
          resumeAfterDocker: options.resumeAfterDocker,
        })

        await refreshProgress(systemId)

        if (isPausedInstallResponse(response)) {
          setStates((current) => ({
            ...current,
            [systemId]: { phase: 'awaiting_docker', result: current[systemId]?.result },
          }))
          return null
        }

        if (!response.ok) {
          const failedResult = response.result
          setStates((current) => ({
            ...current,
            [systemId]: {
              phase: 'error',
              error: response.message,
              result: failedResult ?? current[systemId]?.result,
            },
          }))
          stopProgressPolling(systemId)
          return failedResult ?? null
        }

        if (!('result' in response)) {
          stopProgressPolling(systemId)
          return null
        }

        setStates((current) => ({
          ...current,
          [systemId]: { phase: 'success', result: response.result },
        }))
        stopProgressPolling(systemId)
        installContextRef.current.delete(systemId)
        return response.result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStates((current) => ({
          ...current,
          [systemId]: { phase: 'error', error: message, result: current[systemId]?.result },
        }))
        stopProgressPolling(systemId)
        return null
      } finally {
        void refreshProgress(systemId)
      }
    },
    [refreshProgress, startProgressPolling, stopProgressPolling],
  )

  const install = useCallback(
    async (
      systemId: string,
      source: ProjectSourceInput,
      installationPlan: InstallationPlan,
      options: { accessMode: SystemAccessMode; overlayEnabled?: boolean; lanHost?: string },
    ) => {
      return runInstallRequest(systemId, source, installationPlan, options)
    },
    [runInstallRequest],
  )

  const resumeInstallAfterDocker = useCallback(
    async (systemId: string) => {
      const ctx = installContextRef.current.get(systemId)
      if (!ctx) return null
      return runInstallRequest(systemId, ctx.source, ctx.installationPlan, {
        accessMode: ctx.accessMode,
        overlayEnabled: ctx.overlayEnabled,
        lanHost: ctx.lanHost,
        resumeAfterDocker: true,
      })
    },
    [runInstallRequest],
  )

  return { getState, getProgress, install, resumeInstallAfterDocker }
}
