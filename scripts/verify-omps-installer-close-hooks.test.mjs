import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('builder-debug OMPS inclui installer.nsh dedicado do hub', () => {
  const debug = path.join(root, 'release', 'omps-hub', 'builder-debug.yml')
  if (!fs.existsSync(debug)) {
    console.log('[skip] rebuild package:omps-unified para gerar builder-debug.yml')
    return
  }
  const src = fs.readFileSync(debug, 'utf8')
  assert.match(src, /omps-unified-nsis[\\/]installer\.nsh/)
  const hubNsh = fs.readFileSync(path.join(root, 'desktop', 'omps-unified-nsis', 'installer.nsh'), 'utf8')
  assert.match(hubNsh, /customBeforeCopyInstalledFiles/)
  const extractNsh = fs.readFileSync(
    path.join(
      root,
      'node_modules',
      'app-builder-lib',
      'templates',
      'nsis',
      'include',
      'extractAppPackage.nsh',
    ),
    'utf8',
  )
  assert.match(extractNsh, /SM_PATCH_CUSTOM_BEFORE_COPY/)
})

test('omps-hub electron-main suprime erro ao encerrar', () => {
  const main = fs.readFileSync(path.join(root, 'omps-hub', 'electron-main.mjs'), 'utf8')
  assert.match(main, /isQuitting/)
  assert.match(main, /before-quit/)
  assert.match(main, /unhandledRejection/)
})
