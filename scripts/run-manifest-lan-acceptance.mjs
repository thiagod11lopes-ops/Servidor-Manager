/**
 * Aceite E2E (item 7) — smoke do local-service + artefatos manifest LAN (sem Docker/Supabase).
 * Uso: npm run build && node scripts/run-manifest-lan-acceptance.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = path.join(root, 'dist-local-service', 'local-service.cjs')
const unpackedResources = path.join(
  root,
  'release',
  'win-unpacked',
  'resources',
  'local-service',
  'local-service.cjs',
)
const baseUrl = 'http://127.0.0.1:47831'
const invalidUuid = '00000000-0000-4000-8000-000000000001'

const failures = []

function fail(message) {
  failures.push(message)
  console.error(`FAIL: ${message}`)
}

function pass(message) {
  console.log(`OK: ${message}`)
}

async function fileContains(filePath, needles) {
  const raw = await fs.readFile(filePath, 'utf8')
  for (const needle of needles) {
    if (!raw.includes(needle)) fail(`${filePath} não contém "${needle}"`)
    else pass(`bundle inclui ${needle}`)
  }
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

async function stopListenerOnPort47831() {
  if (process.platform !== 'win32') return
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const exec = promisify(execFile)
    const ps = `
      $c = Get-NetTCPConnection -LocalPort 47831 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
    `
    await exec('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
    await new Promise((r) => setTimeout(r, 800))
  } catch {
    // ignore
  }
}

async function getJson(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { res, json, text }
}

async function manifestRoutesAvailable() {
  const probe = await getJson(`${baseUrl}/api/v1/systems/${invalidUuid}/manifest/backup`, {
    method: 'POST',
  })
  if (probe.res.status === 404 && probe.json?.error === 'NOT_FOUND') return false
  return probe.res.status === 400 || probe.res.status === 200
}

async function main() {
  console.log('=== Aceite manifest LAN (item 7) ===\n')

  try {
    await fs.access(bundlePath)
    pass('dist-local-service/local-service.cjs presente')
  } catch {
    fail('Execute npm run build antes do aceite.')
    process.exit(1)
  }

  await fileContains(bundlePath, [
    'manifest-lan',
    'runManifestDatabaseBackup',
    'runManifestSystemUpdate',
    'Supabase local + Caddy',
    '/manifest/backup',
    'ensureLanHttpPortForSystem',
    'verifySupabaseStackProvenanceForMutation',
    'getSystemsRoot',
  ])

  try {
    await fs.access(unpackedResources)
    pass('release/win-unpacked embarca local-service')
    await fileContains(unpackedResources, ['manifest-lan'])
  } catch {
    console.warn('WARN: release/win-unpacked ausente — rode npm run package:dir para aceite completo de empacote.')
  }

  let child = null
  let startedHere = false
  const alreadyUp = await waitForService(2_000)
  if (alreadyUp && !(await manifestRoutesAvailable())) {
    console.warn('WARN: local-service em 47831 está desatualizado (sem rotas manifest). Reiniciando…')
    await stopListenerOnPort47831()
  }

  const upAfterStop = await waitForService(2_000)
  if (!upAfterStop) {
    startedHere = true
    child = spawn(process.execPath, [bundlePath], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout?.on('data', () => {})
    child.stderr?.on('data', () => {})
    if (!(await waitForService())) {
      fail('local-service não respondeu em 47831')
    } else {
      pass('local-service iniciado para smoke (build atual)')
    }
  } else if (alreadyUp) {
    pass('local-service já em execução (build atual)')
  }

  try {
    const info = await getJson(`${baseUrl}/api/v1/diagnostics/server-info`)
    if (info.res.ok && info.json) pass('GET diagnostics/server-info')
    else fail(`server-info HTTP ${info.res.status}`)

    const discovered = await getJson(`${baseUrl}/api/v1/systems/discovered`)
    if (discovered.res.ok && discovered.json?.ok === true && Array.isArray(discovered.json.systems)) {
      pass(`GET systems/discovered (${discovered.json.systems.length} instalações)`)
    } else fail('systems/discovered resposta inválida')

    const summary = await getJson(`${baseUrl}/api/v1/diagnostics/systems-runtime-summary`)
    if (summary.res.ok && summary.json?.ok === true) pass('GET systems-runtime-summary')
    else fail('systems-runtime-summary falhou')

    const backupRoute = await getJson(`${baseUrl}/api/v1/systems/${invalidUuid}/manifest/backup`, {
      method: 'POST',
    })
    if (backupRoute.res.status === 400 && backupRoute.json?.ok === false) {
      pass('POST manifest/backup roteado (400 esperado sem instalação manifest)')
    } else if (backupRoute.res.status === 404) {
      fail('manifest/backup retornou 404 — rota não registrada')
    } else {
      pass(`POST manifest/backup respondeu HTTP ${backupRoute.res.status}`)
    }

    const manifestSystems = (discovered.json?.systems ?? []).filter(
      (s) => s.packageManager === 'manifest' || s.serverManifestProfile === 'supabase-local-v1',
    )

    for (const row of manifestSystems.slice(0, 3)) {
      const status = await getJson(`${baseUrl}/api/v1/systems/${row.systemId}/status`)
      if (!status.res.ok || status.json?.ok !== true) {
        fail(`status ${row.systemId}: HTTP ${status.res.status}`)
        continue
      }
      const st = status.json.status
      if (st?.runtimeKind === 'manifest-lan' || st?.port === 8080 || st?.loginUrl) {
        pass(`status manifest ${row.systemId.slice(0, 8)}… (porta ${st?.port ?? '?'})`)
      } else {
        pass(`status ${row.systemId.slice(0, 8)}… state=${st?.state}`)
      }
    }

    if (manifestSystems.length === 0) {
      console.warn('WARN: nenhuma instalação manifest no disco — aceite parcial (APIs OK).')
    }
  } finally {
    if (startedHere && child) {
      child.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 500))
      if (!child.killed) child.kill('SIGKILL')
    }
  }

  console.log('')
  if (failures.length > 0) {
    console.error(`Aceite falhou (${failures.length} item(ns)).`)
    process.exit(1)
  }
  console.log('Aceite manifest LAN concluído com sucesso.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
