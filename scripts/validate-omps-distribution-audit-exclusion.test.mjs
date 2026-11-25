import test from 'node:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const serverNsis = join(root, 'release', 'servidor-omps', 'Servidor OMPS.exe')
const clientNsis = join(root, 'release', 'omps-usuario', 'OMPS Usuario.exe')
const distServer = join(root, 'release', 'omps-unified', 'Servidor OMPS.exe')
const distClient = join(root, 'release', 'omps-unified', 'OMPS Usuario.exe')

test('verify-omps-distributables: pasta final e builds independentes alinhados', {
  skip: !existsSync(serverNsis) || !existsSync(clientNsis) || !existsSync(distServer) || !existsSync(distClient),
}, () => {
  const r = spawnSync(process.execPath, ['scripts/verify-omps-distributables-readonly.mjs'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (r.status !== 0) {
    throw new Error(`verify-omps-distributables exit ${r.status}`)
  }
})
