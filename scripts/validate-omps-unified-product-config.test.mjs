import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CLIENT_INSTALLER_APP_ID,
  CLIENT_INSTALL_DIR_WIN,
  GENERIC_MANAGER_APP_ID,
  GENERIC_MANAGER_NSIS_ARTIFACT,
  OMPS_CLIENT_INSTALLER_RELATIVE,
  OMPS_USUARIO_APP_ID,
  OMPS_UNIFIED_APP_ID,
  OMPS_UNIFIED_CHOICES,
  OMPS_UNIFIED_COMPONENTS,
  OMPS_UNIFIED_NSIS_ARTIFACT,
  SERVER_USER_DATA_ROOT_WIN,
  SERVIDOR_OMPS_APP_ID,
  SERVIDOR_OMPS_NSIS_ARTIFACT,
} from './omps-unified-product-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('appIds e artefatos NSIS do hub, servidor OMPS e manager genérico são distintos', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  const servidorYml = await fs.readFile(path.join(root, 'electron-builder.servidor-omps.yml'), 'utf8')
  const unifiedYml = await fs.readFile(path.join(root, 'electron-builder.omps-unified.yml'), 'utf8')

  const appIds = new Set([
    pkg.build.appId,
    SERVIDOR_OMPS_APP_ID,
    OMPS_UNIFIED_APP_ID,
    CLIENT_INSTALLER_APP_ID,
    OMPS_USUARIO_APP_ID,
  ])
  assert.equal(appIds.size, 5)

  assert.equal(pkg.build.appId, GENERIC_MANAGER_APP_ID)
  assert.equal(pkg.build.nsis.artifactName, GENERIC_MANAGER_NSIS_ARTIFACT)
  assert.match(servidorYml, new RegExp(`appId:\\s*${SERVIDOR_OMPS_APP_ID.replace('.', '\\.')}`))
  assert.match(servidorYml, /artifactName:\s*Servidor OMPS\.\$\{ext\}/)
  assert.match(unifiedYml, new RegExp(`appId:\\s*${OMPS_UNIFIED_APP_ID.replace(/\./g, '\\.')}`))
  assert.match(unifiedYml, /artifactName:\s*Instalar OMPS\.\$\{ext\}/)
  assert.match(unifiedYml, /executableName:\s*OMPS/)
  assert.doesNotMatch(unifiedYml, /artifactName:\s*OMPS\.\$\{ext\}/)
  assert.doesNotMatch(unifiedYml, /artifactName:\s*servidor\.\$\{ext\}/)
})

test('diretórios de dados servidor e cliente não coincidem', () => {
  assert.notEqual(SERVER_USER_DATA_ROOT_WIN.toLowerCase(), CLIENT_INSTALL_DIR_WIN.replace(/%/g, '').toLowerCase())
  assert.match(CLIENT_INSTALL_DIR_WIN, /AcompOPMS/i)
  assert.match(SERVER_USER_DATA_ROOT_WIN, /ServidorManager/i)
})

test('payload servidor exclui Instalador OPMS do workspace OMPS', async () => {
  const spec = await fs.readFile(path.join(root, 'scripts', 'omps-payload-spec.mjs'), 'utf8')
  assert.match(spec, /Instalador OPMS/)
})

test('contrato unificado define duas escolhas e subcomponentes', () => {
  assert.equal(OMPS_UNIFIED_COMPONENTS[OMPS_UNIFIED_CHOICES.SERVER].requiresGitHubAtRuntime, false)
  assert.equal(OMPS_UNIFIED_COMPONENTS[OMPS_UNIFIED_CHOICES.CLIENT].requiresGitHubAtRuntime, false)
  assert.equal(OMPS_UNIFIED_COMPONENTS[OMPS_UNIFIED_CHOICES.CLIENT].requiresServerUrl, false)
  assert.equal(OMPS_UNIFIED_NSIS_ARTIFACT, 'Instalar OMPS.${ext}')
  assert.notEqual(SERVIDOR_OMPS_NSIS_ARTIFACT, OMPS_UNIFIED_NSIS_ARTIFACT)
})

test('instalador cliente referenciado existe no workspace vendored', async () => {
  const clientBuilder = path.join(root, OMPS_CLIENT_INSTALLER_RELATIVE, 'electron-builder.yml')
  const stat = await fs.stat(clientBuilder)
  assert.ok(stat.isFile())
  const yml = await fs.readFile(clientBuilder, 'utf8')
  assert.match(yml, new RegExp(`appId:\\s*${CLIENT_INSTALLER_APP_ID.replace(/\./g, '\\.')}`))
  assert.match(yml, /portable/)
})

test('package:installer genérico não usa config OMPS unificada', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  const installer = pkg.scripts['package:installer'] ?? ''
  assert.doesNotMatch(installer, /electron-builder\.omps-unified\.yml/)
})

test('electron-builder.omps-unified inclui subinstallers e hub', async () => {
  const yml = await fs.readFile(path.join(root, 'electron-builder.omps-unified.yml'), 'utf8')
  assert.match(yml, /omps-hub/)
  assert.match(yml, /subinstallers/)
  assert.match(yml, /omps-unified-manifest\.json/)
  assert.match(yml, /buildResources:\s*desktop\/omps-unified-nsis/)
})
