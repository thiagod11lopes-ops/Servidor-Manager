import test from 'node:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const unpacked = join(root, 'release', 'servidor-omps', 'win-unpacked')

test('inspect-servidor-omps-artifacts valida win-unpacked e NSIS', { skip: !existsSync(unpacked) }, () => {
  const r = spawnSync(process.execPath, ['scripts/inspect-servidor-omps-artifacts.mjs'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (r.status !== 0) {
    throw new Error(`inspect exit ${r.status}`)
  }
})
