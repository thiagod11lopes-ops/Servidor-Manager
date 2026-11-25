#!/usr/bin/env node
/**
 * Consolida release/omps-unified/ com os dois instaladores NSIS independentes (cópia byte-a-byte).
 */
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
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

function copyVerified(from, to) {
  assert.ok(existsSync(from), `origem ausente: ${from}`)
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  const a = sha256File(from)
  const b = sha256File(to)
  assert.equal(a, b, `cópia corrompida: ${to}`)
  return { sha256: a, bytes: statSync(from).size }
}

function main() {
  const serverSrc = join(root, SERVIDOR_OMPS_BUILD_OUTPUT_DIR, SERVER_EXE)
  const clientSrc = join(root, OMPS_USUARIO_BUILD_OUTPUT_DIR, CLIENT_SUBINSTALLER_NSIS_FILENAME)
  const distRoot = join(root, OMPS_UNIFIED_DISTRIBUTION_DIR)
  const serverDest = join(distRoot, SERVER_EXE)
  const clientDest = join(distRoot, CLIENT_SUBINSTALLER_NSIS_FILENAME)

  const server = copyVerified(serverSrc, serverDest)
  const client = copyVerified(clientSrc, clientDest)

  const manifest = {
    schema: 'omps-unified-distribution/1',
    builtAt: new Date().toISOString(),
    distributionModel: 'independent-nsis-pair',
    hubRequired: false,
    installers: {
      server: {
        fileName: SERVER_EXE,
        relativePath: SERVER_EXE,
        sourceDir: SERVIDOR_OMPS_BUILD_OUTPUT_DIR,
        ...server,
      },
      client: {
        fileName: CLIENT_SUBINSTALLER_NSIS_FILENAME,
        relativePath: CLIENT_SUBINSTALLER_NSIS_FILENAME,
        sourceDir: OMPS_USUARIO_BUILD_OUTPUT_DIR,
        ...client,
      },
    },
  }

  writeFileSync(
    join(distRoot, OMPS_UNIFIED_DISTRIBUTION_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  console.log('[omps-unified-release] OK', distRoot, {
    serverSha256: server.sha256,
    clientSha256: client.sha256,
  })
}

main()
