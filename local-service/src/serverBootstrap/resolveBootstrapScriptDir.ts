import fs from 'node:fs'
import path from 'node:path'

/** Pasta com Invoke-ServerBootstrap.ps1 (empacotado ou dev). */
export function resolveBootstrapScriptDir(): string | null {
  const fromEnv = process.env.SM_BOOTSTRAP_DIR?.trim()
  if (fromEnv && fs.existsSync(path.join(fromEnv, 'Invoke-ServerBootstrap.ps1'))) {
    return fromEnv
  }

  const fromResources = process.env.SM_RESOURCES_PATH
    ? path.join(process.env.SM_RESOURCES_PATH, 'server-bootstrap')
    : null
  if (fromResources && fs.existsSync(path.join(fromResources, 'Invoke-ServerBootstrap.ps1'))) {
    return fromResources
  }

  const devCandidates = [path.join(process.cwd(), 'scripts'), path.join(process.cwd(), '..', 'scripts')]
  for (const dir of devCandidates) {
    if (fs.existsSync(path.join(dir, 'Invoke-ServerBootstrap.ps1'))) return dir
  }

  return null
}
