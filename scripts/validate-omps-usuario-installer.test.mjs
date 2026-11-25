import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { OMPS_USUARIO_APP_ID, OMPS_USUARIO_NSIS_ARTIFACT } from './omps-unified-product-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('electron-builder.omps-usuario define artefato e contrato', async () => {
  const yml = await fs.readFile(path.join(root, 'electron-builder.omps-usuario.yml'), 'utf8')
  assert.match(yml, new RegExp(`appId:\\s*${OMPS_USUARIO_APP_ID.replace(/\./g, '\\.')}`))
  assert.match(yml, /artifactName:\s*OMPS Usuario\.\$\{ext\}/)
  assert.match(yml, /servidor-omps-product\.json/)
  assert.match(yml, /executableName:\s*AcompOPMS/)
  assert.match(yml, /installer-omps-usuario\.nsh/)
})

test('NSIS OMPS Usuário oferece atalho desktop opcional', async () => {
  const nsh = await fs.readFile(path.join(root, 'desktop', 'installer-omps-usuario.nsh'), 'utf8')
  assert.match(nsh, /OMPS Usuário\.lnk/)
  assert.match(nsh, /CreateDesktopShortcut 0/)
  assert.match(nsh, /CreateDesktopShortcut 1/)
  assert.match(nsh, /PostInstall-OmpsUsuario\.ps1/)
})

test('PostInstall grava config derivada do contrato', async () => {
  const ps1 = await fs.readFile(path.join(root, 'scripts', 'PostInstall-OmpsUsuario.ps1'), 'utf8')
  assert.match(ps1, /servidor-omps-product\.json/)
  assert.match(ps1, /acomopms-desktop\.config\.json/)
  assert.match(ps1, /UTF8Encoding/)
  assert.doesNotMatch(ps1, /Set-Content.*-Encoding UTF8/)
  assert.doesNotMatch(ps1, /\$host\s=/)
})

test('wizard portable permanece separado do NSIS de produção', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  assert.match(pkg.scripts['package:omps-usuario'] ?? '', /electron-builder\.omps-usuario\.yml/)
  assert.match(pkg.scripts['build:omps-client-installer'] ?? '', /build:win/)
  assert.notEqual(OMPS_USUARIO_NSIS_ARTIFACT, 'AcompOPMS-Instalador-${version}-win-x64.${ext}')
})
