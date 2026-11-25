import { spawnSync } from 'node:child_process'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const stamp = spawnSync('node', ['scripts/stamp-manager-version.mjs', '--omps'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})
if (stamp.status !== 0) process.exit(stamp.status ?? 1)

console.log('[dev:omps] UI Servidor OMPS em http://127.0.0.1:5173/dashboard (localhost)')
console.log('[dev:omps] API local: http://127.0.0.1:47831 — rode npm run dev:local-service em outro terminal')

const child = spawn('npx', ['vite', '--open', '/dashboard'], {
  cwd: root,
  env: { ...process.env, MANAGER_PRODUCT_DISPLAY_NAME: 'Servidor OMPS' },
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
