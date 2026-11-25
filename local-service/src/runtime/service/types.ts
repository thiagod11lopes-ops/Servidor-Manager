export type ServiceStartupMode = 'automatic' | 'manual'

export type ServiceVisualState = 'not_installed' | 'stopped' | 'running' | 'error'

export type ServiceConfigSnapshot = {
  systemId: string
  serviceName: string
  installed: boolean
  startupMode: ServiceStartupMode
  installedPath: string
  hostScriptPath: string
  installedAt: string | null
  lastError: string | null
  updatedAt: string
}

export type ServiceStatusSnapshot = {
  systemId: string
  serviceName: string
  installed: boolean
  running: boolean
  startupMode: ServiceStartupMode
  visualState: ServiceVisualState
  installedPath: string
  lastError: string | null
  windowsState: string | null
}

export type ServiceActionResponse =
  | { ok: true; status: ServiceStatusSnapshot; message?: string }
  | { ok: false; message: string; status?: ServiceStatusSnapshot; code?: string }
