import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('inspect-omps-unified-release valida pasta final', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'inspect-omps-unified-release.mjs')], {
    cwd: root,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    throw new Error(`inspect exit ${r.status}\n${r.stdout}\n${r.stderr}`)
  }
})
