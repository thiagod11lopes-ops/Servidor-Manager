import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('main.cjs usa resolvePackagedUiIndex e não fallback cego', () => {
  const main = fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8')
  assert.match(main, /resolvePackagedUiIndex/)
  assert.doesNotMatch(main, /if \(fs\.existsSync\(externalUi\)\)\s*\{\s*return externalUi\s*\}/)
})

test('serve-manager-ui valida uiRoot antes de escutar', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'serve-manager-ui.mjs'), 'utf8')
  assert.match(script, /validateManagerUiBundle/)
})

test('Launch-ServidorManager.cmd resolve InstallRoot oficial OMPS', () => {
  const cmd = fs.readFileSync(path.join(root, 'scripts', 'Launch-ServidorManager.cmd'), 'utf8')
  assert.match(cmd, /Resolve-ManagerInstallRoot\.ps1/)
})

test('Start-ServidorManager-NoElectron usa ui-dist', () => {
  const ps1 = fs.readFileSync(path.join(root, 'scripts', 'Start-ServidorManager-NoElectron.ps1'), 'utf8')
  assert.match(ps1, /resources\\ui-dist/)
})

test('Update-ProgramFiles valida ui-dist após cópia', () => {
  const ps1 = fs.readFileSync(path.join(root, 'backups', 'Update-ProgramFiles-OmpsResources-Once.ps1'), 'utf8')
  assert.match(ps1, /validate-manager-ui-bundle\.mjs/)
})

test('Update-ProgramFiles sincroniza Start-ServidorManager-NoElectron.ps1', () => {
  const ps1 = fs.readFileSync(path.join(root, 'backups', 'Update-ProgramFiles-OmpsResources-Once.ps1'), 'utf8')
  assert.match(ps1, /Start-ServidorManager-NoElectron\.ps1/)
  assert.match(ps1, /validate-pf-update-artifacts\.mjs/)
})

test('electron-builder copia ui-dist para resources', () => {
  const yml = fs.readFileSync(path.join(root, 'electron-builder.servidor-omps.yml'), 'utf8')
  assert.match(yml, /to: ui-dist/)
})
