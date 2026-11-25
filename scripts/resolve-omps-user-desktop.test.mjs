import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const resolver = path.join(root, 'scripts', 'Resolve-OmpsUserDesktopDirectory.ps1')

function runGetDesktop(envExtra = {}) {
  const script = `. '${resolver.replace(/'/g, "''")}'; Get-OmpsUserDesktopDirectory`
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', env: { ...process.env, ...envExtra }, windowsHide: true },
  )
}

test('Get-OmpsUserDesktopDirectory usa USERPROFILE\\Desktop quando existente', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omps-desktop-'))
  const desktop = path.join(tmp, 'Desktop')
  fs.mkdirSync(desktop)
  const r = runGetDesktop({ USERPROFILE: tmp, OneDrive: '' })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const out = (r.stdout || '').trim().split(/\r?\n/).pop()
  assert.equal(path.normalize(out), path.normalize(desktop))
})

test('Create-DesktopShortcut-OmpsUsuario.ps1 falha claro se exe ausente', () => {
  const create = path.join(root, 'scripts', 'Create-DesktopShortcut-OmpsUsuario.ps1')
  const tmpInstall = fs.mkdtempSync(path.join(os.tmpdir(), 'omps-install-'))
  fs.copyFileSync(resolver, path.join(tmpInstall, 'Resolve-OmpsUserDesktopDirectory.ps1'))
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      create,
      '-InstallRoot',
      tmpInstall,
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  assert.notEqual(r.status, 0)
  assert.match(r.stderr + r.stdout, /cliente ausente/i)
})
