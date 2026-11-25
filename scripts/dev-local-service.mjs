import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  printOmpsDevInstallRootHint,
  resolveOmpsDevInstallRoot,
} from './resolve-omps-dev-install-root.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const env = { ...process.env }
const installRoot = resolveOmpsDevInstallRoot()
if (installRoot) {
  env.SERVIDOR_MANAGER_INSTALL_ROOT = installRoot
  console.log(`[dev:local-service] SERVIDOR_MANAGER_INSTALL_ROOT=${installRoot}`)
} else {
  printOmpsDevInstallRootHint()
}

env.SM_LOCAL_SERVICE_URL = env.SM_LOCAL_SERVICE_URL?.trim() || 'http://127.0.0.1:47831'
console.log(`[dev:local-service] localhost API ${env.SM_LOCAL_SERVICE_URL}`)

const child = spawn('npm', ['run', 'dev', '--prefix', 'local-service'], {
  env,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
