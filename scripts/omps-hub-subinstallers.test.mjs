import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { resolveLaunchTarget, resolveSubinstallers } from '../omps-hub/src/subinstallerManifest.mjs'

test('resolveSubinstallers encontra NSIS servidor e OMPS Usuario', () => {
  const root = mkdtempSync(join(tmpdir(), 'omps-sub-'))
  mkdirSync(join(root, 'servidor-omps', 'win-unpacked'), { recursive: true })
  writeFileSync(join(root, 'servidor-omps/Servidor OMPS.exe'), '')
  writeFileSync(join(root, 'servidor-omps/win-unpacked/ServidorManager.exe'), '')
  mkdirSync(join(root, 'cliente'), { recursive: true })
  writeFileSync(join(root, 'cliente/OMPS Usuario.exe'), '')

  const r = resolveSubinstallers(root, {})
  assert.equal(r.ok.server, true)
  assert.equal(r.ok.client, true)
})

test('launch servidor exige Servidor OMPS.exe', () => {
  const root = mkdtempSync(join(tmpdir(), 'omps-sub-'))
  mkdirSync(join(root, 'servidor-omps/win-unpacked'), { recursive: true })
  const t = resolveLaunchTarget(root, {}, 'server')
  assert.equal(t.ok, false)
  assert.match(t.message, /Servidor OMPS/)
})

test('launch cliente aponta OMPS Usuario NSIS', () => {
  const root = mkdtempSync(join(tmpdir(), 'omps-sub-'))
  mkdirSync(join(root, 'cliente'), { recursive: true })
  writeFileSync(join(root, 'cliente/OMPS Usuario.exe'), '')
  const t = resolveLaunchTarget(root, { client: { exeRelative: 'cliente/OMPS Usuario.exe' } }, 'client')
  assert.equal(t.ok, true)
  assert.match(t.executable, /OMPS Usuario\.exe/)
  assert.equal(t.kind, 'omps-usuario-nsis')
})

test('escolhas servidor e cliente não compartilham executável', () => {
  const root = mkdtempSync(join(tmpdir(), 'omps-sub-'))
  mkdirSync(join(root, 'servidor-omps'), { recursive: true })
  writeFileSync(join(root, 'servidor-omps/Servidor OMPS.exe'), '')
  mkdirSync(join(root, 'cliente'), { recursive: true })
  writeFileSync(join(root, 'cliente/OMPS Usuario.exe'), '')
  const srv = resolveLaunchTarget(root, {}, 'server')
  const cli = resolveLaunchTarget(root, {}, 'client')
  assert.notEqual(srv.executable, cli.executable)
})
