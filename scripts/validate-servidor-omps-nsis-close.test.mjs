import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Servidor OMPS NSIS encerra instância via Stop-ServidorManager antes do taskkill genérico', async () => {
  const nsh = await fs.readFile(path.join(root, 'desktop', 'installer-servidor-omps.nsh'), 'utf8')
  assert.match(nsh, /customCheckAppRunning/)
  assert.match(nsh, /BUILD_UNINSTALLER/)
  assert.match(nsh, /Stop-ServidorManager-Installed\.ps1/)
  assert.match(nsh, /INSTALL_REGISTRY_KEY/)
  assert.match(nsh, /OmpsStageStopScriptsInPluginsDir/)
  assert.match(nsh, /Stop-OmpsHub-Installed\.ps1/)
  assert.match(nsh, /_CHECK_APP_RUNNING/)
})

test('hub OMPS inicia Servidor via cmd start e só então encerra (app.exit)', async () => {
  const main = await fs.readFile(path.join(root, 'omps-hub', 'electron-main.mjs'), 'utf8')
  assert.match(main, /choice === 'server'/)
  assert.match(main, /launchWindowsSubinstaller/)
  assert.match(main, /app\.exit\(0\)/)
  assert.doesNotMatch(main, /Get-Process -Id \$parent/)
})
