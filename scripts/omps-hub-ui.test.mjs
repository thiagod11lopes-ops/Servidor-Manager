import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const uiDir = path.join(root, 'omps-hub', 'ui')

test('UI do hub expõe duas opções e cancelar', async () => {
  const html = await fs.readFile(path.join(uiDir, 'index.html'), 'utf8')
  const js = await fs.readFile(path.join(uiDir, 'hub.js'), 'utf8')
  assert.match(html, /Servidor OMPS/)
  assert.match(html, /OMPS Usuário/)
  assert.match(html, /id="btnServer"/)
  assert.match(html, /id="btnClient"/)
  assert.match(html, /id="btnCancel"/)
  assert.match(js, /launch\('server'\)/)
  assert.match(js, /launch\('client'\)/)
})
