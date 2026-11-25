import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const resolveScript = path.join(root, 'scripts', 'Resolve-ManagerNodeRuntime.ps1')
const installRoot = path.join(root, 'release', 'win-unpacked')
const bundledVendorNode = path.join(root, 'vendor', 'bundled-node', 'win-x64', 'node.exe')

function windowsMinimalPathEnv() {
  const winDir = process.env.WINDIR ?? 'C:\\Windows'
  return `${winDir}\\System32\\WindowsPowerShell\\v1.0;${winDir}\\System32`
}

function invokeGetRuntime(installRootPath, extraEnv = {}) {
  const ps = [
    '-NoProfile',
    '-Command',
    `. '${resolveScript.replace(/'/g, "''")}'; $r = Get-ManagerNodeRuntime -Root '${installRootPath.replace(/'/g, "''")}'; Write-Output ($r.Mode + '|' + $r.Executable)`,
  ]
  return spawnSync('powershell.exe', ps, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  })
}

function invokeGetRuntimeExpectFailure(installRootPath, extraEnv = {}) {
  const ps = [
    '-NoProfile',
    '-Command',
    `$ErrorActionPreference = 'Stop'; . '${resolveScript.replace(/'/g, "''")}'; try { Get-ManagerNodeRuntime -Root '${installRootPath.replace(/'/g, "''")}' | Out-Null; exit 0 } catch { Write-Output $_.Exception.Message; exit 1 }`,
  ]
  return spawnSync('powershell.exe', ps, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: windowsMinimalPathEnv(),
      SM_ALLOW_ELECTRON_RUNTIME: '0',
      SM_FORCE_ELECTRON_RUNTIME: '0',
      ...extraEnv,
    },
  })
}

function prepareFakeInstallWithBundledNode() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-runtime-test-'))
  const resources = path.join(tmp, 'resources', 'nodejs')
  fs.mkdirSync(resources, { recursive: true })
  if (!fs.existsSync(bundledVendorNode)) {
    return null
  }
  fs.copyFileSync(bundledVendorNode, path.join(resources, 'node.exe'))
  return tmp
}

describe('Get-ManagerNodeRuntime', () => {
  it('prefere bundled-node quando node embarcado existe no pacote', () => {
    const fakeRoot = prepareFakeInstallWithBundledNode()
    if (!fakeRoot) {
      return
    }
    const result = invokeGetRuntime(fakeRoot, {
      PATH: windowsMinimalPathEnv(),
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const [mode, exe] = result.stdout.trim().split('|')
    assert.equal(mode, 'bundled-node')
    assert.match(exe, /nodejs\\node\.exe$/i)
    fs.rmSync(fakeRoot, { recursive: true, force: true })
  })

  it('usa system-node quando embarcado ausente e node do sistema e compativel', () => {
    if (!fs.existsSync(installRoot)) {
      return
    }
    const nodeCheck = spawnSync('node', ['--version'], { encoding: 'utf8' })
    if (nodeCheck.status !== 0) {
      return
    }

    const result = invokeGetRuntime(installRoot, { SM_ALLOW_ELECTRON_RUNTIME: '0' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const [mode] = result.stdout.trim().split('|')
    assert.ok(mode === 'bundled-node' || mode === 'system-node', `modo inesperado: ${mode}`)
  })

  it('SM_FORCE_ELECTRON_RUNTIME=1 seleciona electron quando o exe existe', () => {
    if (!fs.existsSync(path.join(installRoot, 'ServidorManager.exe'))) {
      return
    }

    const result = invokeGetRuntime(installRoot, { SM_FORCE_ELECTRON_RUNTIME: '1' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const [mode] = result.stdout.trim().split('|')
    assert.equal(mode, 'electron')
  })

  it('falha com mensagem clara quando nenhum runtime valido esta disponivel', () => {
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-runtime-empty-'))
    const result = invokeGetRuntimeExpectFailure(fakeRoot)
    assert.equal(result.status, 1, result.stderr || result.stdout)
    assert.match(result.stdout, /Runtime Node indisponivel/i)
    fs.rmSync(fakeRoot, { recursive: true, force: true })
  })
})

describe('Update-InstalledManager.ps1 (contrato)', () => {
  it('nao encerra processos electron indiscriminadamente', () => {
    const updateScript = fs.readFileSync(path.join(root, 'scripts', 'Update-InstalledManager.ps1'), 'utf8')
    assert.doesNotMatch(updateScript, /Get-Process\s+-Name\s+'electron'/i)
    assert.doesNotMatch(updateScript, /Stop-Process.*electron/i)
    assert.match(updateScript, /Stop-ServidorManager-Installed\.ps1/)
    assert.match(updateScript, /Assert-InstallRootQuiescentForUpdate/)
  })
})

describe('Stop-ServidorManager-Installed.ps1 (contrato)', () => {
  it('encerra apenas processos do InstallRoot ou PIDs da sessao', () => {
    const stopScript = fs.readFileSync(path.join(root, 'scripts', 'Stop-ServidorManager-Installed.ps1'), 'utf8')
    assert.match(stopScript, /InstallRoot/)
    assert.match(stopScript, /Get-ManagerLauncherSessionPath/)
    assert.match(stopScript, /Stop-ProcessesForInstallRoot/)
    assert.match(stopScript, /Stop-ServidorManagerExecutableForInstallRoot/)
    assert.doesNotMatch(stopScript, /Get-Process\s+-Name\s+'electron'/i)
  })
})

describe('Start-ServidorManager-NoElectron.ps1 (contrato)', () => {
  it('expoe modo interativo opcional, sessao e diagnostico de falha', () => {
    const launcher = fs.readFileSync(
      path.join(root, 'scripts', 'Start-ServidorManager-NoElectron.ps1'),
      'utf8',
    )
    assert.match(launcher, /\[switch\]\s+\$Interactive/)
    assert.match(launcher, /Save-ManagerLauncherSession/)
    assert.match(launcher, /Stop-ProcessesForInstallRoot/)
    assert.match(launcher, /Write-ManagerLauncherDiagnostic/)
    assert.match(launcher, /Show-ManagerLauncherErrorMessage/)
    assert.doesNotMatch(launcher, /-NoExit/)
  })
})
