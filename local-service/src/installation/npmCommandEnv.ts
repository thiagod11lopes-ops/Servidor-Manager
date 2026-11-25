/** Ambiente para npm em subprocessos (stdout piped): logs lineares, devDependencies incluídas. */
export function buildNpmSubprocessEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...base,
    NODE_ENV: 'development',
    NPM_CONFIG_PRODUCTION: 'false',
    CI: 'true',
    NPM_CONFIG_LOGLEVEL: base.NPM_CONFIG_LOGLEVEL ?? 'notice',
    NPM_CONFIG_PROGRESS: 'false',
    npm_config_progress: 'false',
  }
}

export function resolveNpmInstallTimeoutMs(): number {
  const raw = process.env.MANAGER_NPM_INSTALL_TIMEOUT_MS
  if (raw) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed >= 60_000) return parsed
  }
  return 900_000
}
