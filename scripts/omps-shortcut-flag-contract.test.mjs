import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PS_TIMEOUT_MS = 45_000

function isolatedEnv(profileDir) {
  const localAppData = path.join(profileDir, 'AppData', 'Local')
  fs.mkdirSync(localAppData, { recursive: true })
  return {
    ...process.env,
    USERPROFILE: profileDir,
    LOCALAPPDATA: localAppData,
    OneDrive: '',
  }
}

function runPostInstall(installRootRel, scriptRel, flag, env) {
  const script = path.join(root, installRootRel, scriptRel)
  if (!fs.existsSync(script)) {
    return { skipped: true }
  }
  const args = [
    '-NoProfile',
    '-File',
    script,
    '-InstallRoot',
    path.join(root, installRootRel),
    '-CreateDesktopShortcut',
    flag,
  ]
  const r = spawnSync('powershell.exe', args, {
    encoding: 'utf8',
    timeout: PS_TIMEOUT_MS,
    windowsHide: true,
    env,
  })
  return { skipped: false, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error }
}

function desktopLnkCount(profileDir) {
  const desktop = path.join(profileDir, 'Desktop')
  if (!fs.existsSync(desktop)) return 0
  return fs.readdirSync(desktop).filter((n) => n.toLowerCase().endsWith('.lnk')).length
}

function withIsolatedProfile(fn) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'omps-shortcut-contract-'))
  fs.mkdirSync(path.join(profile, 'Desktop'), { recursive: true })
  const env = isolatedEnv(profile)
  try {
    return fn(profile, env)
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

test(
  'Servidor: flag 0 via -File não cria .lnk; flag 1 cria Servidor OMPS.lnk',
  { timeout: PS_TIMEOUT_MS * 2 + 10_000 },
  () => {
    const installRoot = 'release/servidor-omps/win-unpacked'
    const scriptRel = 'resources/server-bootstrap/PostInstall-ServidorOmpsShortcuts.ps1'
    if (!fs.existsSync(path.join(root, installRoot, 'ServidorManager.exe'))) {
      return
    }

    withIsolatedProfile((profile, env) => {
      const run0 = runPostInstall(installRoot, scriptRel, '0', env)
      assert.equal(run0.skipped, false)
      assert.ifError(run0.error)
      assert.equal(run0.status, 0, run0.stderr || run0.stdout)
      assert.match(run0.stdout, /omitido|Menu Iniciar/i)
      assert.equal(desktopLnkCount(profile), 0, 'flag 0 não deve criar atalhos')

      const run1 = runPostInstall(installRoot, scriptRel, '1', env)
      assert.equal(run1.status, 0, run1.stderr || run1.stdout)
      assert.ok(desktopLnkCount(profile) >= 1, 'flag 1 deve criar ao menos Servidor OMPS.lnk')
    })
  },
)

test(
  'Usuario: flag 0 via -File não cria .lnk; flag 1 cria OMPS Usuário.lnk',
  { timeout: PS_TIMEOUT_MS * 2 + 10_000 },
  () => {
    const installRoot = 'release/omps-usuario/win-unpacked'
    const scriptRel = 'resources/omps-usuario-bootstrap/PostInstall-OmpsUsuario.ps1'
    if (!fs.existsSync(path.join(root, installRoot, 'AcompOPMS.exe'))) {
      return
    }

    withIsolatedProfile((profile, env) => {
      const run0 = runPostInstall(installRoot, scriptRel, '0', env)
      assert.equal(run0.skipped, false)
      assert.ifError(run0.error)
      assert.equal(run0.status, 0, run0.stderr || run0.stdout)
      assert.match(run0.stdout, /omitido|Menu Iniciar/i)
      assert.equal(desktopLnkCount(profile), 0)

      const run1 = runPostInstall(installRoot, scriptRel, '1', env)
      assert.equal(run1.status, 0, run1.stderr || run1.stdout)
      assert.equal(desktopLnkCount(profile), 1, 'flag 1 deve criar um atalho OMPS Usuário')
    })
  },
)
