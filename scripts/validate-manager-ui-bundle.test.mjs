import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  resolvePackagedUiIndex,
  validateManagerUiBundle,
} from './validate-manager-ui-bundle.mjs'

test('validateManagerUiBundle aceita dist de build Vite', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.log('[skip] dist/ ausente — rode npm run build')
    return
  }
  const result = validateManagerUiBundle(root)
  assert.equal(result.ok, true)
  assert.ok(result.mainJsAsset)
})

test('detecta assets ausentes', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-invalid-'))
  fs.writeFileSync(
    path.join(temp, 'index.html'),
    '<html><script type="module" src="/assets/index-missing.js"></script></html>',
    'utf8',
  )
  const result = validateManagerUiBundle(temp)
  assert.equal(result.ok, false)
  assert.match(result.reason, /ausentes/)
  fs.rmSync(temp, { recursive: true, force: true })
})

test('OMPS exige ui-dist válido — sem fallback asar silencioso', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-resolve-'))
  const resources = path.join(temp, 'resources')
  const appPath = path.join(temp, 'app')
  fs.mkdirSync(path.join(resources, 'ui-dist'), { recursive: true })
  fs.mkdirSync(path.join(appPath, 'dist', 'assets'), { recursive: true })
  fs.writeFileSync(path.join(resources, 'servidor-omps-product.json'), '{}', 'utf8')
  fs.writeFileSync(
    path.join(appPath, 'dist', 'index.html'),
    '<html><script type="module" src="/assets/index-old.js"></script></html>',
    'utf8',
  )
  fs.writeFileSync(path.join(appPath, 'dist', 'assets', 'index-old.js'), 'console.log("old")', 'utf8')

  const resolved = resolvePackagedUiIndex({ resourcesPath: resources, appPath })
  assert.equal(resolved.ok, false)
  assert.equal(resolved.source, 'ui-dist-required')
  fs.rmSync(temp, { recursive: true, force: true })
})

test('ui-dist válido tem prioridade sobre asar', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-priority-'))
  const resources = path.join(temp, 'resources')
  const appPath = path.join(temp, 'app')
  const uiRoot = path.join(resources, 'ui-dist')
  fs.mkdirSync(path.join(uiRoot, 'assets'), { recursive: true })
  fs.writeFileSync(
    path.join(uiRoot, 'index.html'),
    '<html><script type="module" src="/assets/index-new.js"></script></html>',
    'utf8',
  )
  fs.writeFileSync(path.join(uiRoot, 'assets', 'index-new.js'), 'console.log("new")', 'utf8')
  fs.mkdirSync(path.join(appPath, 'dist', 'assets'), { recursive: true })
  fs.writeFileSync(
    path.join(appPath, 'dist', 'index.html'),
    '<html><script type="module" src="/assets/index-old.js"></script></html>',
    'utf8',
  )
  fs.writeFileSync(path.join(appPath, 'dist', 'assets', 'index-old.js'), 'console.log("old")', 'utf8')

  const resolved = resolvePackagedUiIndex({ resourcesPath: resources, appPath })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.source, 'ui-dist')
  assert.match(resolved.indexPath, /ui-dist[\\/]index\.html$/)
  fs.rmSync(temp, { recursive: true, force: true })
})
