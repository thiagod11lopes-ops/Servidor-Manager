import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'scripts', 'inspect-omps-usuario-artifacts.mjs')

test('inspect-omps-usuario-artifacts valida win-unpacked e NSIS', () => {
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`inspect exit ${r.status}\n${r.stdout}\n${r.stderr}`)
  }
  assert.match(r.stdout, /contrato OK/)
})
