/**
 * Evidência estática: qual PRODUCT_NAME gera "Não é possível fechar o …" em cada variante NSIS.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  OMPS_UNIFIED_PRODUCT_NAME,
  SERVIDOR_OMPS_APP_ID,
} from './omps-unified-product-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const messagesPath = path.join(
  root,
  'node_modules',
  'app-builder-lib',
  'templates',
  'nsis',
  'messages.yml',
)

test('pt_BR appCannotBeClosed interpola PRODUCT_NAME (origem do texto na UI)', async () => {
  const yml = await fs.readFile(messagesPath, 'utf8')
  const block = yml.split('appCannotBeClosed:')[1].split(/\n\S/)[0]
  assert.match(block, /pt_BR:/)
  assert.match(block, /\$\{PRODUCT_NAME\}/)
})

test('hub OMPS usa PRODUCT_NAME=OMPS e customCheckAppRunning dedicado', async () => {
  const unifiedYml = await fs.readFile(path.join(root, 'electron-builder.omps-unified.yml'), 'utf8')
  assert.match(unifiedYml, /productName:\s*OMPS/)
  assert.match(unifiedYml, /executableName:\s*OMPS/)
  assert.match(unifiedYml, /buildResources:\s*desktop\/omps-unified-nsis/)
  const nsh = await fs.readFile(path.join(root, 'desktop', 'omps-unified-nsis', 'installer.nsh'), 'utf8')
  assert.match(nsh, /Stop-OmpsHub-Installed\.ps1/)
  assert.match(nsh, /customBeforeCopyInstalledFiles/)
  assert.match(nsh, /!macro customCheckAppRunning/)
  assert.doesNotMatch(nsh, /!else[\s\S]*!insertmacro _CHECK_APP_RUNNING/)
  assert.equal(OMPS_UNIFIED_PRODUCT_NAME, 'OMPS')
})

test('Servidor OMPS usa PRODUCT_NAME distinto (Servidor OMPS) e APP ServidorManager', async () => {
  const yml = await fs.readFile(path.join(root, 'electron-builder.servidor-omps.yml'), 'utf8')
  assert.match(yml, /productName:\s*Servidor OMPS/)
  assert.match(yml, /executableName:\s*ServidorManager/)
  assert.match(yml, /installer-servidor-omps\.nsh/)
  assert.match(yml, new RegExp(`appId:\\s*${SERVIDOR_OMPS_APP_ID.replace('.', '\\.')}`))
})

test(
  'builder-debug do hub inclui omps-unified-nsis/installer.nsh quando artefato existe',
  { skip: !existsSync(path.join(root, 'release', 'omps-hub', 'builder-debug.yml')) },
  async () => {
    const debugPath = path.join(root, 'release', 'omps-hub', 'builder-debug.yml')
    const dbg = await fs.readFile(debugPath, 'utf8')
    assert.match(dbg, /omps-unified-nsis\\installer\.nsh/)
    assert.doesNotMatch(dbg, /desktop\\installer\.nsh/)
  },
)
