import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function source(name) {
  return readFileSync(join(root, name), 'utf8')
}

test('o Kong em loopback é religado sem apagar volumes', () => {
  const helper = source('lib/ensure-kong-loopback.mjs')
  assert.match(helper, /127\.0\.0\.1:54321\/auth\/v1\/health/)
  assert.match(helper, /\['restart', id\]/)
  assert.equal(helper.includes('volume rm'), false)
  assert.equal(helper.includes('--no-backup'), false)
})

test('o edge runtime parado volta com unless-stopped e sem apagar volumes', () => {
  const helper = source('lib/ensure-edge-runtime.mjs')
  assert.match(helper, /unless-stopped/)
  assert.match(helper, /supabase_edge_runtime_/)
  assert.match(helper, /\['start', id\]/)
  assert.equal(helper.includes('volume rm'), false)
  assert.equal(helper.includes('docker rm'), false)
  assert.equal(helper.includes('--no-backup'), false)
})

test('o arranque do Caddy religa a Edge Function antes de reutilizar o proxy', () => {
  const ps1 = source('start-servidor-lan.ps1')
  const helperAt = ps1.indexOf('ensure-edge-runtime.mjs')
  const reuseAt = ps1.indexOf('Caddy reutilizado')
  assert.ok(helperAt > 0 && helperAt < reuseAt)
  const sh = source('start-servidor-lan.sh')
  assert.match(sh, /ensure-edge-runtime\.mjs/)
  assert.match(ps1, /ensure-kong-loopback\.mjs/)
  assert.match(sh, /ensure-kong-loopback\.mjs/)
})

test('start-servidor-lan: Caddy validado e iniciado sem cmd.exe (caminhos com espaco)', () => {
  const ps1 = source('start-servidor-lan.ps1')
  const lib = source('lib/start-caddy-windows.ps1')
  assert.match(ps1, /start-caddy-windows\.ps1/)
  assert.match(ps1, /Invoke-CaddyValidate/)
  assert.match(ps1, /Start-CaddyLanProcess/)
  assert.match(ps1, /Wait-CaddyLanReady/)
  assert.match(ps1, /ACOMOPMS_SUPABASE_BOOTSTRAP_DONE/)
  assert.doesNotMatch(ps1, /Win32_Process.*Create/s)
  assert.doesNotMatch(ps1, /cmd\.exe \/c/)
  assert.match(lib, /Start-Process/)
  assert.match(lib, /validate/)
  assert.match(lib, /\/login/)
  const sh = source('start-servidor-lan.sh')
  assert.match(sh, /caddy validate/)
  assert.match(sh, /\/login/)
  assert.match(sh, /ACOMOPMS_SUPABASE_BOOTSTRAP_DONE/)
})
