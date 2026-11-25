import { useCallback, useEffect, useRef, useState } from 'react'
import { localManagerService } from '../services/index.ts'
import type { OmpsContractAccessUiState } from '../utils/ompsContractAccessUi.ts'
import {
  applyOmpsEmbeddedInstallProgress,
  initialOmpsContractAccessUiState,
  markOmpsContractAccessAnalyzing,
  markOmpsContractAccessPollFailed,
  reduceOmpsContractAccessPoll,
} from '../utils/ompsContractAccessUi.ts'
import { RUNTIME_CHANGED_EVENT } from '../utils/runtimeChangedEvent.ts'
import { isServidorOmpsServerProduct } from '../utils/packagedBundledOmps.ts'
import type { InstallationProgressSnapshot } from '../types/installationProgress.ts'

const POLL_INTERVAL_MS = 60_000
const ANALYZE_TICK_MS = 1_500
const OMPS_DEFAULT_USUARIO_LOGIN_URL = 'http://127.0.0.1:8080/login'

function seedOmpsContractAccessUiState(): OmpsContractAccessUiState {
  const loginUrl = isServidorOmpsServerProduct() ? OMPS_DEFAULT_USUARIO_LOGIN_URL : '—'
  return initialOmpsContractAccessUiState(loginUrl)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function installStillRunning(progress: InstallationProgressSnapshot | null | undefined): boolean {
  const status = progress?.status
  return status === 'running' || status === 'awaiting_docker' || status === 'partial'
}

function installStopped(progress: InstallationProgressSnapshot | null | undefined): boolean {
  const status = progress?.status
  return status === 'failed' || status === 'interrupted' || status === 'succeeded'
}

export function useOmpsContractAccessStatus(enabled: boolean, refreshSignal?: string | number | null) {
  const [state, setState] = useState<OmpsContractAccessUiState>(() => seedOmpsContractAccessUiState())
  const [controlBusy, setControlBusy] = useState<'pause' | 'restart' | null>(null)
  const inFlight = useRef(false)
  const analyzeSession = useRef(false)
  const mounted = useRef(true)
  const stateRef = useRef(state)
  stateRef.current = state

  const refresh = useCallback(async () => {
    if (!enabled || inFlight.current || analyzeSession.current) return
    inFlight.current = true
    try {
      const response = await localManagerService.getServidorOmpsContractAccess()
      if (!mounted.current) return
      setState((prev) => reduceOmpsContractAccessPoll(prev, response))
    } catch {
      if (!mounted.current) return
      const checkedAt = new Date().toISOString()
      setState((prev) =>
        markOmpsContractAccessPollFailed(
          prev,
          'Não foi possível verificar o serviço HTTP (API local indisponível ou timeout).',
          checkedAt,
        ),
      )
    } finally {
      inFlight.current = false
    }
  }, [enabled])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      analyzeSession.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    setState(seedOmpsContractAccessUiState())
    void refresh()
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [enabled, refresh, refreshSignal])

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const onRuntimeChanged = () => {
      void refresh()
    }
    window.addEventListener(RUNTIME_CHANGED_EVENT, onRuntimeChanged)
    return () => window.removeEventListener(RUNTIME_CHANGED_EVENT, onRuntimeChanged)
  }, [enabled, refresh])

  /** Sessão visível: barra + status até Ativo, falha, pausa ou parada da instalação. */
  const analyze = useCallback(async () => {
    if (!enabled || analyzeSession.current) return
    analyzeSession.current = true
    inFlight.current = true
    setState((prev) => markOmpsContractAccessAnalyzing(prev))

    const endSession = (updater: (prev: OmpsContractAccessUiState) => OmpsContractAccessUiState) => {
      analyzeSession.current = false
      inFlight.current = false
      setState((prev) => {
        const next = updater(prev)
        return {
          ...next,
          analyzing: false,
          analyzeStartedAt: null,
          frozenReport: null,
        }
      })
    }

    try {
      try {
        const kickoff = await localManagerService.analyzeServidorOmpsAccess()
        if (!mounted.current || !analyzeSession.current) return
        setState((prev) => {
          const next = reduceOmpsContractAccessPoll(prev, kickoff)
          return {
            ...next,
            analyzing: true,
            analyzeStartedAt: prev.analyzeStartedAt,
            frozenReport: prev.frozenReport,
            embeddedInstallProgress: prev.embeddedInstallProgress,
            message:
              kickoff.ok && kickoff.available && kickoff.availability === 'active'
                ? kickoff.message
                : kickoff.message ||
                  'Preparando o motor embutido. Acompanhe a barra até o endereço responder.',
          }
        })
        if (kickoff.ok && kickoff.available && kickoff.availability === 'active') {
          endSession((prev) => reduceOmpsContractAccessPoll(prev, kickoff))
          return
        }
      } catch {
        if (!mounted.current || !analyzeSession.current) return
        setState((prev) => ({
          ...prev,
          analyzing: true,
          message:
            'Não foi possível iniciar a análise na API. Tentando acompanhar o progresso mesmo assim…',
        }))
      }

      let idleTicksAfterStop = 0
      while (mounted.current && analyzeSession.current) {
        let progress: InstallationProgressSnapshot | null = null
        try {
          const payload = await localManagerService.getServidorOmpsEmbeddedInstallProgress()
          if (payload.ok) progress = payload.progress
        } catch {
          // continua o loop
        }

        if (!mounted.current || !analyzeSession.current) return

        setState((prev) => applyOmpsEmbeddedInstallProgress(prev, progress))

        let access
        try {
          access = await localManagerService.getServidorOmpsContractAccess()
        } catch {
          access = null
        }

        if (!mounted.current || !analyzeSession.current) return

        if (access) {
          if (access.ok && access.available && access.availability === 'active') {
            endSession((prev) =>
              reduceOmpsContractAccessPoll(
                {
                  ...prev,
                  embeddedInstallProgress: progress ?? prev.embeddedInstallProgress,
                },
                access,
              ),
            )
            return
          }
          setState((prev) => ({
            ...prev,
            analyzing: true,
            analyzeStartedAt: prev.analyzeStartedAt,
            loginUrl:
              access.ok && access.available && access.loginUrl
                ? access.loginUrl
                : prev.loginUrl,
            message: access.message,
            lastCheckedAt: access.checkedAt,
            phase: 'unavailable',
            statusLabel: 'Analizando',
            badgeClass: 'badge-warn',
            embeddedInstallProgress:
              applyOmpsEmbeddedInstallProgress(prev, progress).embeddedInstallProgress,
          }))
        }

        if (installStopped(progress)) {
          if (progress?.status === 'interrupted') {
            endSession((prev) => ({
              ...prev,
              phase: 'unavailable',
              statusLabel: 'Pausado',
              badgeClass: 'badge-warn',
              message: progress.error?.trim() || 'Análise pausada.',
              lastCheckedAt: new Date().toISOString(),
              embeddedInstallProgress: progress,
            }))
            return
          }
          if (progress?.status === 'failed') {
            endSession((prev) => ({
              ...prev,
              phase: 'unavailable',
              statusLabel: 'Indisponível',
              badgeClass: 'badge-warn',
              message:
                progress.error?.split('\n')[0]?.trim() ||
                'A preparação do motor embutido falhou. Use Reiniciar ou Analizar de novo.',
              lastCheckedAt: new Date().toISOString(),
              embeddedInstallProgress: progress,
            }))
            return
          }
          // succeeded no manifesto: ainda pode faltar a 8080 — dá mais alguns ticks
          idleTicksAfterStop += 1
          if (idleTicksAfterStop >= 8) {
            endSession((prev) => ({
              ...prev,
              phase: 'unavailable',
              statusLabel: 'Indisponível',
              badgeClass: 'badge-warn',
              message:
                access?.message?.trim() ||
                'Preparação concluída, mas o endereço ainda não responde na porta 8080.',
              lastCheckedAt: new Date().toISOString(),
              embeddedInstallProgress: progress,
            }))
            return
          }
        } else if (installStillRunning(progress)) {
          idleTicksAfterStop = 0
        }

        await sleep(ANALYZE_TICK_MS)
      }
    } finally {
      if (analyzeSession.current) {
        analyzeSession.current = false
        inFlight.current = false
        if (mounted.current) {
          setState((prev) => ({ ...prev, analyzing: false }))
        }
      }
    }
  }, [enabled])

  const pauseInstall = useCallback(async () => {
    if (!enabled || controlBusy) return
    setControlBusy('pause')
    analyzeSession.current = false
    try {
      const result = await localManagerService.pauseServidorOmpsEmbeddedInstall()
      if (!mounted.current) return
      if (result.ok) {
        setState((prev) => ({
          ...applyOmpsEmbeddedInstallProgress(prev, result.progress),
          analyzing: false,
          analyzeStartedAt: null,
          frozenReport: null,
          phase: 'unavailable',
          statusLabel: 'Pausado',
          badgeClass: 'badge-warn',
          message: result.message,
          lastCheckedAt: new Date().toISOString(),
        }))
      } else {
        setState((prev) => ({
          ...prev,
          analyzing: false,
          message: result.message,
        }))
      }
    } catch {
      if (!mounted.current) return
      setState((prev) => ({
        ...prev,
        analyzing: false,
        message: 'Não foi possível pausar a instalação (API local indisponível).',
      }))
    } finally {
      inFlight.current = false
      if (mounted.current) setControlBusy(null)
    }
  }, [enabled, controlBusy])

  const restartInstall = useCallback(async () => {
    if (!enabled || controlBusy) return
    setControlBusy('restart')
    analyzeSession.current = false
    inFlight.current = false
    setState((prev) => markOmpsContractAccessAnalyzing(prev))
    try {
      const result = await localManagerService.restartServidorOmpsEmbeddedInstall()
      if (!mounted.current) return
      if (!result.ok) {
        setState((prev) => ({
          ...prev,
          analyzing: false,
          analyzeStartedAt: null,
          message: result.message,
        }))
        return
      }
      setState((prev) =>
        applyOmpsEmbeddedInstallProgress(
          {
            ...prev,
            analyzing: false,
            message: result.message,
          },
          result.progress,
        ),
      )
      setControlBusy(null)
      // Nova sessão visível (acompanhar barra até o fim)
      queueMicrotask(() => {
        void analyze()
      })
    } catch {
      if (!mounted.current) return
      setState((prev) => ({
        ...prev,
        analyzing: false,
        analyzeStartedAt: null,
        message: 'Não foi possível reiniciar a instalação (API local indisponível).',
      }))
    } finally {
      if (mounted.current) setControlBusy(null)
    }
  }, [enabled, controlBusy, analyze])

  return { state, refresh, analyze, pauseInstall, restartInstall, controlBusy }
}
