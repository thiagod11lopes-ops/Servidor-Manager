import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'
import { systemRuntimeStateLabel } from '../types/systemRuntime.ts'
import {
  localHttpReachableLabel,
  resolveDisplayLocalProbeUrl,
} from '../utils/systemLocalHttpDisplay.ts'
import {
  normalizeRuntimeStatusForUi,
  resolveShareableLanUrl,
} from '../utils/systemAccessPanelDisplay.ts'
import { isInvalidLanShareHost } from '../utils/lanShareUrl.ts'

type SystemRuntimePanelProps = {
  systemId?: string
  loading?: boolean
  error?: string
  message?: string
  status?: SystemRuntimeStatus
  onRuntimeRefresh?: () => void | Promise<void>
}

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return `${hours}h ${rem}min`
}

function resolvePrimaryAccessHref(status: SystemRuntimeStatus): string | null {
  if (status.accessMode === 'local') {
    const login = status.loginUrl?.trim()
    if (login) return login
  }
  const shareable = resolveShareableLanUrl(status)
  if (shareable) return shareable
  const login = status.loginUrl?.trim()
  if (login) {
    try {
      if (!isInvalidLanShareHost(new URL(login).hostname)) return login
    } catch {
      return login
    }
  }
  return status.lanAccessUrl?.trim() ?? null
}

export function SystemRuntimePanel({
  loading,
  error,
  message,
  status,
}: SystemRuntimePanelProps) {
  if (!loading && !error && !message && !status) return null

  const normalizedStatus = status ? normalizeRuntimeStatusForUi(status) : null
  const isManifestLan = normalizedStatus?.runtimeKind === 'manifest-lan'
  const accessHref = normalizedStatus ? resolvePrimaryAccessHref(normalizedStatus) : null
  const localProbeDisplay = normalizedStatus
    ? resolveDisplayLocalProbeUrl(normalizedStatus.localHttpProbeUrl)
    : null
  const localHttpStatusCode =
    normalizedStatus != null && typeof normalizedStatus.localHttpStatus === 'number'
      ? normalizedStatus.localHttpStatus
      : null

  return (
    <div
      id="system-runtime-panel"
      className={`analysis-panel${error ? ' analysis-panel-error' : ''}`}
    >
      <div className="analysis-header">
        <h3 className="analysis-title">
          {isManifestLan ? 'Execução LAN (Supabase + Caddy)' : 'Execução local'}
        </h3>
      </div>
      {loading ? <p className="analysis-disclaimer">Atualizando execução...</p> : null}
      {error ? <p className="analysis-disclaimer">{error}</p> : null}
      {message && !error ? <p className="analysis-disclaimer">{message}</p> : null}
      {normalizedStatus ? (
        <dl className="analysis-grid runtime-meta">
          {accessHref ? (
            <div className="analysis-span">
              <dt>{normalizedStatus.accessMode === 'local' ? 'Acesso neste computador' : 'Acesso na rede local (LAN)'}</dt>
              <dd>
                <a href={accessHref} target="_blank" rel="noreferrer">
                  {accessHref}
                </a>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Estado</dt>
            <dd>{systemRuntimeStateLabel[normalizedStatus.state]}</dd>
          </div>
          <div className="runtime-local-http">
            <dt>HTTP local</dt>
            <dd>
              <span>{localHttpReachableLabel(normalizedStatus.localHttpReachable)}</span>
              {localHttpStatusCode != null ? (
                <span className="analysis-meta"> — código HTTP {localHttpStatusCode}</span>
              ) : null}
              {localProbeDisplay ? (
                <p className="analysis-meta runtime-local-http-probe">
                  URL consultada: <code>{localProbeDisplay}</code>
                </p>
              ) : null}
            </dd>
          </div>
          {isManifestLan ? (
            <>
              <div>
                <dt>Caddy (:{normalizedStatus.port ?? '8080'})</dt>
                <dd>{normalizedStatus.caddyRunning ? 'Respondendo' : 'Parado'}</dd>
              </div>
              <div>
                <dt>Supabase (Docker)</dt>
                <dd>{normalizedStatus.supabaseRunning ? 'Em execução' : 'Parado'}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>PID</dt>
              <dd>{normalizedStatus.pid ?? '—'}</dd>
            </div>
          )}
          <div>
            <dt>Uptime</dt>
            <dd>{formatUptime(normalizedStatus.uptimeSeconds)}</dd>
          </div>
          <div>
            <dt>Porta</dt>
            <dd>{normalizedStatus.port ?? '—'}</dd>
          </div>
          {normalizedStatus.lastError ? (
            <div className="runtime-error-row">
              <dt>Último erro</dt>
              <dd>{normalizedStatus.lastError}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}
