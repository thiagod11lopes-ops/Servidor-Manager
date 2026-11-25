import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePs1 = path.join(
  root,
  'release',
  'omps-payload',
  'Transferir para Servidor',
  'servidor-lan',
  'start-servidor-lan.ps1',
)

test('payload de desenvolvimento contém arranque Caddy corrigido', () => {
  assert.ok(fs.existsSync(sourcePs1), 'release/omps-payload ausente — rode npm run build:omps-payload')
  const text = fs.readFileSync(sourcePs1, 'utf8')
  assert.match(text, /Start-CaddyLanProcess/)
  assert.doesNotMatch(text, /cmd\.exe \/c.*caddy run/)
})
