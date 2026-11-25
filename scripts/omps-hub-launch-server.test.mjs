import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildWindowsDetachedStartArgs,
  launchWindowsSubinstaller,
} from '../omps-hub/src/launchSubinstaller.mjs'
import { resolveLaunchTarget } from '../omps-hub/src/subinstallerManifest.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')

test('buildWindowsDetachedStartArgs usa cmd start (não PowerShell wait parent)', () => {
  const exe = 'C:\\Program Files\\OMPS\\resources\\subinstallers\\servidor-omps\\Servidor OMPS.exe'
  const { file, args } = buildWindowsDetachedStartArgs(exe)
  assert.match(file.toLowerCase(), /cmd\.exe$/)
  assert.deepEqual(args.slice(0, 5), ['/d', '/s', '/c', 'start', '""'])
  assert.equal(args[5], exe)
})

test('electron-main servidor não usa PowerShell wait-parent', () => {
  const src = readFileSync(join(root, 'omps-hub', 'electron-main.mjs'), 'utf8')
  assert.match(src, /launchWindowsSubinstaller/)
  assert.doesNotMatch(src, /Get-Process -Id \$parent/)
  assert.doesNotMatch(src, /Start-Process -FilePath \$exe/)
})

test('launchWindowsSubinstaller falha claro se exe ausente', async () => {
  const r = await launchWindowsSubinstaller('C:\\nope\\Servidor OMPS.exe')
  assert.equal(r.ok, false)
  assert.match(r.message, /não encontrado/i)
})

test('resolveLaunchTarget servidor aponta Servidor OMPS.exe embutido', () => {
  const subRoot = mkdtempSync(join(tmpdir(), 'omps-launch-'))
  mkdirSync(join(subRoot, 'servidor-omps'), { recursive: true })
  const rel = join('servidor-omps', 'Servidor OMPS.exe')
  writeFileSync(join(subRoot, rel), 'stub')
  const t = resolveLaunchTarget(subRoot, {}, 'server')
  assert.equal(t.ok, true)
  assert.match(t.executable.replace(/\\/g, '/'), /servidor-omps\/Servidor OMPS\.exe$/)
})

test('artefato empacotado inclui subinstalador Servidor OMPS.exe quando win-unpacked existe', () => {
  const packaged = join(
    root,
    'release',
    'omps-hub',
    'win-unpacked',
    'resources',
    'subinstallers',
    'servidor-omps',
    'Servidor OMPS.exe',
  )
  if (!existsSync(packaged)) {
    console.log('[skip] win-unpacked hub ausente — rode package:omps-hub')
    return
  }
  const t = resolveLaunchTarget(
    join(root, 'release', 'omps-hub', 'win-unpacked', 'resources', 'subinstallers'),
    {},
    'server',
  )
  assert.equal(t.ok, true)
  assert.match(t.executable, /Servidor OMPS\.exe$/)
})
