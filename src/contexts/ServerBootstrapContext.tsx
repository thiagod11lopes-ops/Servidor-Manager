import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { localManagerService } from '../services/index.ts'
import type { BootstrapJobRecord, ServerBootstrapStatus } from '../types/serverBootstrap.ts'

export type ServerBootstrapContextValue = {
  status: ServerBootstrapStatus | null
  loading: boolean
  error: string | undefined
  job: BootstrapJobRecord | null
  logTail: string
  installBusy: boolean
  refresh: () => Promise<void>
  runInstall: (options: { launchDockerDesktop?: boolean }) => Promise<void>
}

const ServerBootstrapContext = createContext<ServerBootstrapContextValue | null>(null)

export function ServerBootstrapProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServerBootstrapStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()
  const [job, setJob] = useState<BootstrapJobRecord | null>(null)
  const [logTail, setLogTail] = useState('')
  const [installBusy, setInstallBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const response = await localManagerService.getServerBootstrapStatus()
      if (!response.ok) {
        setError(response.message)
        setStatus(null)
        return
      }
      setStatus(response.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao consultar bootstrap.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!job || job.phase === 'success' || job.phase === 'error' || job.phase === 'cancelled') {
      return
    }
    const timer = window.setInterval(async () => {
      const response = await localManagerService.getServerBootstrapJob(job.jobId)
      if (!response.ok) return
      setJob(response.job)
      setLogTail(response.logTail)
      if (response.job.phase === 'success' || response.job.phase === 'error') {
        setInstallBusy(false)
        void refresh()
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [job, refresh])

  const runInstall = useCallback(async (options: { launchDockerDesktop?: boolean }) => {
    setInstallBusy(true)
    setError(undefined)
    setLogTail('')
    const response = await localManagerService.startServerBootstrapInstall({
      installMissing: true,
      launchDockerDesktop: options.launchDockerDesktop ?? true,
    })
    if (!response.ok) {
      setInstallBusy(false)
      setError(response.message)
      return
    }
    setJob(response.job)
  }, [])

  const value = useMemo<ServerBootstrapContextValue>(
    () => ({
      status,
      loading,
      error,
      job,
      logTail,
      installBusy,
      refresh,
      runInstall,
    }),
    [status, loading, error, job, logTail, installBusy, refresh, runInstall],
  )

  return (
    <ServerBootstrapContext.Provider value={value}>{children}</ServerBootstrapContext.Provider>
  )
}

export function useServerBootstrapContext(): ServerBootstrapContextValue {
  const ctx = useContext(ServerBootstrapContext)
  if (!ctx) {
    throw new Error('useServerBootstrapContext deve ser usado dentro de ServerBootstrapProvider.')
  }
  return ctx
}
