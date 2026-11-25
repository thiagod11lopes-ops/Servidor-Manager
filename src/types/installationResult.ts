export type InstallationResult = {
  ok: boolean
  systemId: string
  installDirectory: string
  projectDirectory: string
  installedAt: string
  dependencyInstall: 'sucesso' | 'nao_executado' | 'falha'
  buildStatus: 'executado' | 'nao_identificado' | 'nao_executado' | 'falha'
  databaseNote: string
  messages: string[]
  error?: string
}

export type InstallationResponse =
  | { ok: true; result: InstallationResult }
  | { ok: true; accepted: true; systemId: string }
  | { ok: false; message: string; result?: InstallationResult }
  | { ok: false; paused: true; code: 'DOCKER_AWAITING'; message: string }
