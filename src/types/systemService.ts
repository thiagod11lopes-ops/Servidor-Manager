export type ServiceStartupMode = 'automatic' | 'manual'

export type ServiceVisualState = 'not_installed' | 'stopped' | 'running' | 'error'

export type SystemServiceStatus = {
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

export type SystemServiceConfig = {
  systemId: string
  serviceName: string
  installed: boolean
  startupMode: ServiceStartupMode
  installedPath: string
}

export type SystemServiceConfigResponse = {
  ok: true
  config: SystemServiceConfig
  status: SystemServiceStatus
}

export type SystemServiceActionResponse =
  | { ok: true; status: SystemServiceStatus; message?: string }
  | { ok: false; message: string; status?: SystemServiceStatus; code?: string }

export const serviceVisualStateLabel: Record<ServiceVisualState, string> = {
  not_installed: 'Não instalado',
  stopped: 'Instalado / parado',
  running: 'Executando',
  error: 'Erro',
}
