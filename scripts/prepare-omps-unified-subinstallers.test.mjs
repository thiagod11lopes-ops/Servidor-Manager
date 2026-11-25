import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { OMPS_UNIFIED_BUNDLE_DIR, OMPS_UNIFIED_MANIFEST_FILENAME } from './omps-unified-product-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'scripts', 'prepare-omps-unified-subinstallers.mjs')

test('prepare falha sem win-unpacked', () => {
  const r = spawnSync(process.execPath, [script, '--allow-missing-client', '--allow-missing-server-nsis'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, OMPS_PREPARE_TEST_SKIP: '1' },
  })
  if (existsSync(path.join(root, 'release/servidor-omps/win-unpacked'))) {
    assert.equal(r.status, 0)
    return
  }
  assert.notEqual(r.status, 0)
})

test('manifest bundle schema quando prepare succeede', () => {
  const manifestPath = path.join(root, OMPS_UNIFIED_BUNDLE_DIR, OMPS_UNIFIED_MANIFEST_FILENAME)
  if (!existsSync(manifestPath)) return
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.schema, 'omps-unified-bundle/1')
  assert.equal(manifest.hub.appId, 'com.servidor.omps.unified')
  assert.equal(manifest.server.appId, 'com.servidor.omps')
})
