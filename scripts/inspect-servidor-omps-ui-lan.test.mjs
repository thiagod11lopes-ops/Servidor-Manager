/**
 * Confirma faixa LAN no ui-dist empacotado (win-unpacked Servidor OMPS).
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const unpacked = join(fileURLToPath(import.meta.url), '..', '..', 'release', 'servidor-omps', 'win-unpacked')
const assetsDir = join(unpacked, 'resources', 'ui-dist', 'assets')

test('win-unpacked contém strings da faixa LAN no bundle JS', () => {
  if (!existsSync(assetsDir)) {
    assert.fail('release/servidor-omps/win-unpacked ausente — rode npm run package:servidor-omps')
  }
  const main = readdirSync(assetsDir).find((f) => /^index-.*\.js$/.test(f))
  assert.ok(main, 'index-*.js ausente em ui-dist/assets')
  const js = readFileSync(join(assetsDir, main), 'utf8')
  assert.ok(js.includes('Rede local (LAN)'), 'label LAN no dashboard')
  assert.ok(js.includes('resolveDashboardLanAccessView') || js.includes('Determinando o endereço'), 'lógica LAN')
})
