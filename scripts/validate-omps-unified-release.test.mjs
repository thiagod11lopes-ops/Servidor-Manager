import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CLIENT_SUBINSTALLER_NSIS_FILENAME,
  OMPS_HUB_BUILD_OUTPUT_DIR,
  OMPS_UNIFIED_DISTRIBUTION_DIR,
  OMPS_UNIFIED_DISTRIBUTION_MANIFEST,
} from './omps-unified-product-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('distribuição final não usa pasta do hub como output do electron-builder', async () => {
  const yml = await fs.readFile(path.join(root, 'electron-builder.omps-unified.yml'), 'utf8')
  assert.match(yml, new RegExp(`output:\\s*${OMPS_HUB_BUILD_OUTPUT_DIR.replace(/\//g, '\\/')}`))
  assert.doesNotMatch(yml, /output:\s*release\/omps-unified/)
})

test('spec define pasta de distribuição com dois instaladores na raiz', () => {
  assert.equal(OMPS_UNIFIED_DISTRIBUTION_DIR, 'release/omps-unified')
  assert.equal(OMPS_UNIFIED_DISTRIBUTION_MANIFEST, 'omps-unified-distribution.json')
  assert.equal(CLIENT_SUBINSTALLER_NSIS_FILENAME, 'OMPS Usuario.exe')
})
