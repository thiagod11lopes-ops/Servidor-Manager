export type DockerEngineState = {
  installed: boolean
  running: boolean
  detail: string
  desktopUiRunning: boolean
}

export type DockerEnsureResponse =
  | { ok: true; state: DockerEngineState; message: string }
  | {
      ok: false
      code: 'not_installed' | 'start_failed' | 'timeout' | 'unsupported_platform'
      state: DockerEngineState
      message: string
    }

export type DockerStatusResponse = {
  ok: true
  state: DockerEngineState
}
