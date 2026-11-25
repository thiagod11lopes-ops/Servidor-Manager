import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const target = join(root, 'node_modules', 'app-builder-lib', 'out', 'codeSign', 'windowsSignToolManager.js')
const vendorRcedit = join(root, 'vendor', 'winCodeSign', 'rcedit-x64.exe')

test('patch winCodeSign referencia vendor do repositório', () => {
  assert.ok(existsSync(target), 'windowsSignToolManager.js ausente — npm install')
  const src = readFileSync(target, 'utf8')
  assert.match(src, /OMPS_WINCODESIGN_VENDOR/)
  assert.match(src, /repoVendor/)
  assert.match(src, /rcedit-x64\.exe/)
})

test('patch binDownload intercepta winCodeSign', () => {
  const binDl = join(root, 'node_modules', 'app-builder-lib', 'out', 'binDownload.js')
  const src = readFileSync(binDl, 'utf8')
  assert.match(src, /OMPS_WINCODESIGN_BIN/)
  assert.match(src, /localWinCodeSignOrNull/)
})

test('vendor winCodeSign extraído sem symlink darwin obrigatório', () => {
  assert.ok(existsSync(vendorRcedit), 'rode npm run ensure:wincodesign-vendor')
})
