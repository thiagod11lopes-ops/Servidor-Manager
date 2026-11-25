import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL_SERVICE_URL = process.env.SM_LOCAL_SERVICE_URL?.trim() || 'http://127.0.0.1:47831'
const CHROME_DASHBOARD = 'http://127.0.0.1:5173/dashboard'

/** Servidor OMPS localhost: API (47831) + UI Vite (5173), sem instalador. */
const children = []

function runNodeScript(relativeScript) {
  const child = spawn('node', [relativeScript], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  })
  children.push(child)
  return child
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForLocalService(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  const probeUrl = `${LOCAL_SERVICE_URL}/api/v1/diagnostics/server-info`
  while (Date.now() < deadline) {
    try {
      const res = await fetch(probeUrl, {
        signal: AbortSignal.timeout(3_000),
        headers: { Accept: 'application/json' },
      })
      if (res.ok) return true
    } catch {
      // API ainda subindo
    }
    await sleep(500)
  }
  return false
}

console.log('[dev:omps:stack] Chrome (dev): abra', CHROME_DASHBOARD)
console.log('[dev:omps:stack] Subindo API local, depois UI Vite (Ctrl+C encerra os dois)...')

const service = runNodeScript('scripts/dev-local-service.mjs')

const apiReady = await waitForLocalService()
if (!apiReady) {
  console.warn('[dev:omps:stack] API local demorou — iniciando UI mesmo assim; aguarde alguns segundos e recarregue o Chrome.')
} else {
  console.log('[dev:omps:stack] API local pronta:', LOCAL_SERVICE_URL)
}

const ui = runNodeScript('scripts/dev-omps-ui.mjs')

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

let exiting = false
function onChildExit(label, code, signal) {
  if (exiting) return
  exiting = true
  if (signal) {
    console.log(`[dev:omps:stack] ${label} encerrou (sinal ${signal}).`)
  } else if (code !== 0) {
    console.error(`[dev:omps:stack] ${label} saiu com código ${code}.`)
  }
  shutdown('SIGTERM')
  process.exit(code ?? 1)
}

service.on('exit', (code, signal) => onChildExit('API local', code, signal))
ui.on('exit', (code, signal) => onChildExit('UI Vite', code, signal))
