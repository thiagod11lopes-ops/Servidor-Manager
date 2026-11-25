#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLIENT_SUBINSTALLER_NSIS_FILENAME,
  OMPS_UNIFIED_DISTRIBUTION_DIR,
  OMPS_UNIFIED_DISTRIBUTION_MANIFEST,
  OMPS_USUARIO_BUILD_OUTPUT_DIR,
  SERVIDOR_OMPS_BUILD_OUTPUT_DIR,
} from './omps-unified-product-spec.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_EXE = 'Servidor OMPS.exe'

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function main() {
  const dist = join(root, OMPS_UNIFIED_DISTRIBUTION_DIR)
  const serverDist = join(dist, SERVER_EXE)
  const clientDist = join(dist, CLIENT_SUBINSTALLER_NSIS_FILENAME)
  const serverSrc = join(root, SERVIDOR_OMPS_BUILD_OUTPUT_DIR, SERVER_EXE)
  const clientSrc = join(root, OMPS_USUARIO_BUILD_OUTPUT_DIR, CLIENT_SUBINSTALLER_NSIS_FILENAME)
  const manifestPath = join(dist, OMPS_UNIFIED_DISTRIBUTION_MANIFEST)

  assert.ok(existsSync(serverDist), `${SERVER_EXE} ausente na distribuição`)
  assert.ok(existsSync(clientDist), `${CLIENT_SUBINSTALLER_NSIS_FILENAME} ausente na distribuição`)
  assert.equal(sha256File(serverDist), sha256File(serverSrc), 'Servidor OMPS.exe na pasta final difere do build independente')
  assert.equal(sha256File(clientDist), sha256File(clientSrc), 'OMPS Usuario.exe na pasta final difere do build independente')

  assert.ok(existsSync(manifestPath), 'omps-unified-distribution.json ausente')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.schema, 'omps-unified-distribution/1')
  assert.equal(manifest.hubRequired, false)

  console.log('[inspect-omps-unified-release] OK', {
    serverBytes: statSync(serverDist).size,
    clientBytes: statSync(clientDist).size,
    serverSha256: sha256File(serverDist),
    clientSha256: sha256File(clientDist),
  })
}

main()
