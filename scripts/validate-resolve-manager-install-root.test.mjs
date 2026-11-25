import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Resolve-ManagerInstallRoot prioriza Program Files OMPS completo', () => {
  const ps1 = fs.readFileSync(path.join(root, 'scripts', 'Resolve-ManagerInstallRoot.ps1'), 'utf8')
  assert.match(ps1, /program-files-omps/)
  assert.match(ps1, /Test-ServidorOmpsProductInstall/)
  assert.match(ps1, /Test-ManagerInstallRootComplete/)
})

test('PostInstall OMPS não força LOCALAPPDATA quando NSIS passa InstallRoot', () => {
  const ps1 = fs.readFileSync(path.join(root, 'scripts', 'PostInstall-ServidorOmpsShortcuts.ps1'), 'utf8')
  assert.match(ps1, /\$InstallRoot/)
  assert.match(ps1, /-InstallRoot \$InstallRoot/)
})
