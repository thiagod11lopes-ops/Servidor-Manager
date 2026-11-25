import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  validatePackagedMainCjsContent,
  validatePfUpdateRepoArtifacts,
} from './validate-pf-update-artifacts.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const updateScript = path.join(root, 'backups', 'Update-ProgramFiles-OmpsResources-Once.ps1')

test('Update script sincroniza Start e fallbacks server-bootstrap', () => {
  const ps1 = fs.readFileSync(updateScript, 'utf8')
  assert.match(ps1, /Start-ServidorManager-NoElectron\.ps1/)
  assert.match(ps1, /server-bootstrap/)
  assert.match(ps1, /manager-launcher/)
})

test('Update script valida artefatos antes de modificar Program Files', () => {
  const ps1 = fs.readFileSync(updateScript, 'utf8')
  assert.match(ps1, /validate-pf-update-artifacts\.mjs/)
  const preflightPos = ps1.indexOf('validate-pf-update-artifacts')
  const backupPos = ps1.indexOf('Backup to')
  assert.ok(preflightPos >= 0 && backupPos > preflightPos)
})

test('Update script faz backup de manager-launcher e server-bootstrap', () => {
  const ps1 = fs.readFileSync(updateScript, 'utf8')
  assert.match(ps1, /manager-launcher/)
  assert.match(ps1, /Backup-InstallFileIfExists/)
  assert.match(ps1, /server-bootstrap/)
})

test('Update script encerra e verifica PF e LocalAppData antes de copiar', () => {
  const ps1 = fs.readFileSync(updateScript, 'utf8')
  assert.match(ps1, /LOCALAPPDATA/)
  assert.match(ps1, /Assert-InstallRootQuiescentForUpdate/)
})

test('Update script valida main.cjs no app.asar após patch', () => {
  const ps1 = fs.readFileSync(updateScript, 'utf8')
  assert.match(ps1, /validatePackagedMainCjsContent|validate-pf-update-artifacts/)
  assert.match(ps1, /resolvePackagedUiIndex|ui-dist-required/)
})

test('Update script não altera omps-payload nem ServidorManager.exe', () => {
  const ps1 = fs.readFileSync(updateScript, 'utf8')
  assert.doesNotMatch(ps1, /robocopy.*omps-payload/i)
  assert.match(ps1, /omps-payload.*não foram modificados|preserva/i)
  assert.match(ps1, /ServidorManager\.exe não foram modificados/)
})

test('validatePfUpdateRepoArtifacts aceita build atual do repo', () => {
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    console.log('[skip] dist ausente')
    return
  }
  const result = validatePfUpdateRepoArtifacts(root)
  assert.equal(result.ok, true, result.errors?.join('; '))
})

test('validatePackagedMainCjsContent exige política OMPS', () => {
  const main = fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8')
  const result = validatePackagedMainCjsContent(main)
  assert.equal(result.ok, true)
})

test('Resolve-ManagerInstallRoot prioriza Program Files OMPS', () => {
  const resolve = fs.readFileSync(path.join(root, 'scripts', 'Resolve-ManagerInstallRoot.ps1'), 'utf8')
  assert.match(resolve, /program-files-omps/)
})

test('Launch cmd delega InstallRoot ao resolver', () => {
  const cmd = fs.readFileSync(path.join(root, 'scripts', 'Launch-ServidorManager.cmd'), 'utf8')
  assert.match(cmd, /Resolve-ManagerInstallRoot\.ps1/)
  assert.match(cmd, /Start-ServidorManager-NoElectron\.ps1.*-InstallRoot/)
})
