export type ServerEnvironmentHint = {
  id: string
  severity: 'info' | 'warning' | 'action'
  message: string
}

export type ManifestPrerequisiteIssue = {
  tool: string
  reason: string
  step: string
}

export type DependencyState =
  | 'ok'
  | 'missing'
  | 'broken'
  | 'needs_manual'
  | 'needs_admin'
  | 'needs_reboot'
  | 'not_applicable'

export type ServerDependencyItem = {
  id: string
  label: string
  state: DependencyState
  detail: string
  critical: boolean
}

export type ServerBootstrapStatus = {
  ok: boolean
  readyForManifestInstall: boolean
  platform: 'windows' | 'linux' | null
  os: { label: string; build?: string }
  isAdmin: boolean
  wingetAvailable: boolean
  wsl: { available: boolean; detail: string }
  docker: { installed: boolean; running: boolean; detail: string }
  dependencies: ServerDependencyItem[]
  toolchain: { ok: boolean; checked: string[]; missing: ManifestPrerequisiteIssue[] }
  hints: ServerEnvironmentHint[]
  bootstrapScriptAvailable: boolean
  summary: string
}

export type BootstrapJobOutcome =
  | 'success'
  | 'verification_failed'
  | 'manual_required'
  | 'install_failed'
  | 'winget_missing'

export type BootstrapJobRecord = {
  jobId: string
  phase: 'queued' | 'running' | 'success' | 'error' | 'cancelled'
  outcome?: BootstrapJobOutcome
  startedAt: string
  finishedAt?: string
  logPath: string
  exitCode?: number | null
  message?: string
}

export type ServerBootstrapStatusResponse =
  | { ok: true; status: ServerBootstrapStatus }
  | { ok: false; message: string }

export type ServerBootstrapInstallResponse =
  | { ok: true; job: BootstrapJobRecord }
  | { ok: false; message: string }

export type ServerBootstrapJobResponse =
  | { ok: true; job: BootstrapJobRecord; logTail: string }
  | { ok: false; message: string }

export function dependencyStateLabel(state: DependencyState): string {
  switch (state) {
    case 'ok':
      return 'OK'
    case 'missing':
      return 'Ausente'
    case 'broken':
      return 'Não funcional'
    case 'needs_manual':
      return 'Ação manual'
    case 'needs_admin':
      return 'Admin / UAC'
    case 'needs_reboot':
      return 'Reiniciar'
    case 'not_applicable':
      return 'N/A'
    default:
      return state
  }
}
