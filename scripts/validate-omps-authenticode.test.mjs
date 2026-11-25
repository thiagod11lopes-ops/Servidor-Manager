import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('pipeline OMPS assina win-unpacked antes de NSIS --prepackaged', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  assert.match(pkg.scripts['package:omps-usuario'], /--prepackaged release\/omps-usuario\/win-unpacked/)
  assert.match(pkg.scripts['package:omps-usuario'], /sign:omps-release/)
  assert.match(pkg.scripts['package:servidor-omps'], /--prepackaged release\/servidor-omps\/win-unpacked/)
  assert.match(pkg.scripts['package:servidor-omps'], /sign:omps-release/)
})

test('OMPS usa metadata pós-dir e signAndEditExecutable false (evita winCodeSign symlink)', async () => {
  const usuario = await fs.readFile(path.join(root, 'electron-builder.omps-usuario.yml'), 'utf8')
  const servidor = await fs.readFile(path.join(root, 'electron-builder.servidor-omps.yml'), 'utf8')
  assert.match(usuario, /signAndEditExecutable:\s*false/)
  assert.match(servidor, /signAndEditExecutable:\s*false/)
  const meta = await fs.readFile(path.join(root, 'scripts', 'apply-omps-exe-metadata.mjs'), 'utf8')
  assert.match(meta, /CompanyName/)
  assert.match(meta, /Servidor Manager/)
})

test('verify-omps-authenticode-status emite relatório JSON', () => {
  const r = spawnSync(process.execPath, ['scripts/verify-omps-authenticode-status.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const data = JSON.parse(r.stdout)
  assert.ok(Array.isArray(data.report))
  const client = data.report.find((x) => x.id === 'client-unpacked')
  if (client && !client.missing) {
    assert.ok(['NotSigned', 'Valid', 'UnknownError'].includes(client.status), client.status)
  }
})
