import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOmpsDevInstallRoot } from './resolve-omps-dev-install-root.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const existing = resolveOmpsDevInstallRoot()
if (existing) {
  console.log('[prepare:omps:dev] Servidor OMPS localhost pronto:', existing)
  process.exit(0)
}

console.log('[prepare:omps:dev] Montando recursos de dev (sem instalador NSIS)…')

let step = spawnSync('npm', ['run', 'build:omps-payload'], { cwd: root, stdio: 'inherit', shell: true })
if (step.status !== 0) process.exit(step.status ?? 1)

step = spawnSync('node', ['scripts/stage-omps-dev-install-root.mjs'], { cwd: root, stdio: 'inherit', shell: true })
if (step.status !== 0) process.exit(step.status ?? 1)

const ready = resolveOmpsDevInstallRoot()
if (!ready) {
  console.error('[prepare:omps:dev] Falha ao montar release/servidor-omps/win-unpacked')
  process.exit(1)
}
console.log('[prepare:omps:dev] Use: npm run dev:local-service + npm run dev:omps')
