import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const profileScript = path.join(root, 'scripts', 'ManagerLauncherProfile.ps1')

function runProfileInit(installRoot, dataRoot) {
  const ps = [
    '-NoProfile',
    '-Command',
    `. '${profileScript.replace(/'/g, "''")}'; ` +
      `$ir = '${installRoot.replace(/'/g, "''")}'; ` +
      `$dr = '${dataRoot.replace(/'/g, "''")}'; ` +
      `$p = Initialize-ServidorManagerIsolatedTestProfile -InstallRoot $ir -DataRoot $dr -ServicePort 47832 -UiPort 5200; ` +
      `Write-Output ($p.DataRoot + '|' + $p.ServicePort + '|' + $p.UiPort + '|' + $env:SERVIDOR_MANAGER_DATA_ROOT)`,
  ]
  return spawnSync('powershell.exe', ps, { encoding: 'utf8', env: { ...process.env } })
}

test('Initialize-ServidorManagerIsolatedTestProfile define data root e portas alternativas', () => {
  const installRoot = path.join(root, 'release', 'servidor-omps', 'win-unpacked')
  if (!fs.existsSync(installRoot)) {
    console.log('skip: win-unpacked ausente (rode package:servidor-omps:dir para teste integrado)')
    return
  }
  const dataRoot = path.join(os.tmpdir(), `sm-isolated-${Date.now()}`)
  const result = runProfileInit(installRoot, dataRoot)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const [outDataRoot, svc, ui, envData] = result.stdout.trim().split('|')
  assert.equal(outDataRoot.toLowerCase(), path.resolve(dataRoot).toLowerCase())
  assert.equal(svc, '47832')
  assert.equal(ui, '5200')
  assert.equal(envData.toLowerCase(), path.resolve(dataRoot).toLowerCase())
})

test('recusa DataRoot igual a C:\\ServidorManager', () => {
  const installRoot = path.join(root, 'release', 'servidor-omps', 'win-unpacked')
  if (!fs.existsSync(installRoot)) return
  const result = runProfileInit(installRoot, 'C:\\ServidorManager')
  assert.notEqual(result.status, 0)
})
