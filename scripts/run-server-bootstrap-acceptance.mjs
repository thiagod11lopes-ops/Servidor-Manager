/**
 * Smoke: rotas /api/v1/server/bootstrap/* (nao instala Docker na maquina de dev).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = path.join(root, 'dist-local-service', 'local-service.cjs')
const baseUrl = 'http://127.0.0.1:47831'
const failures = []

function fail(message) {
  failures.push(message)
  console.error(`FAIL: ${message}`)
}

function pass(message) {
  console.log(`OK: ${message}`)
}

async function waitForService(timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/diagnostics/server-info`, {
        signal: AbortSignal.timeout(2_000),
      })
      if (res.ok) return true
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

async function main() {
  try {
    await fs.access(bundlePath)
  } catch {
    fail('Execute npm run build antes do acceptance.')
    process.exit(1)
  }

  const child = spawn(process.execPath, [bundlePath], {
    env: {
      ...process.env,
      SM_BOOTSTRAP_DIR: path.join(root, 'scripts'),
    },
    stdio: 'ignore',
  })

  if (!(await waitForService())) {
    child.kill()
    fail('local-service nao respondeu')
    process.exit(1)
  }
  pass('local-service up')

  const statusRes = await fetch(`${baseUrl}/api/v1/server/bootstrap/status`)
  const statusJson = await statusRes.json()
  if (!statusJson.ok || !statusJson.status?.summary) {
    fail('bootstrap/status invalido')
  } else {
    pass(`bootstrap/status ok=${statusJson.status.ok}`)
  }

  if (!statusJson.status.bootstrapScriptAvailable) {
    fail('bootstrapScriptAvailable deveria ser true com SM_BOOTSTRAP_DIR')
  } else {
    pass('script bootstrap detectado')
  }

  if (!Array.isArray(statusJson.status.dependencies) || statusJson.status.dependencies.length < 5) {
    fail('status.dependencies deveria listar dependencias do perfil')
  } else {
    pass(`dependencies: ${statusJson.status.dependencies.length} itens`)
  }

  if (typeof statusJson.status.readyForManifestInstall !== 'boolean') {
    fail('readyForManifestInstall ausente')
  } else {
    pass(`readyForManifestInstall=${statusJson.status.readyForManifestInstall}`)
  }

  const legacyVpnRes = await fetch(`${baseUrl}/api/v1/network/tailscale/status`, {
    signal: AbortSignal.timeout(5_000),
  })
  if (legacyVpnRes.status !== 404) {
    fail(`rota VPN legada deveria retornar 404, foi ${legacyVpnRes.status}`)
  } else {
    pass('rota VPN legada removida (404)')
  }

  child.kill()
  if (failures.length) {
    process.exit(1)
  }
  console.log('acceptance:server-bootstrap concluido')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
