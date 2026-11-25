import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  encodeLocalFolderSourceUrl,
  normalizeLocalFolderPath,
  parseLocalFolderSourceUrl,
  validateLocalProjectFolder,
} from './localFolderSource.ts'

test('encodeLocalFolderSourceUrl round-trip', () => {
  const p = 'C:\\Projects\\demo'
  const url = encodeLocalFolderSourceUrl(p)
  assert.equal(parseLocalFolderSourceUrl(url), p)
})

test('validateLocalProjectFolder rejects missing structure', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-local-'))
  const result = await validateLocalProjectFolder(dir)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'LOCAL_PROJECT_STRUCTURE_MISSING')
})

test('validateLocalProjectFolder accepts package.json', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-local-'))
  await fs.writeFile(path.join(dir, 'package.json'), '{"name":"demo"}', 'utf8')
  const result = await validateLocalProjectFolder(dir)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(normalizeLocalFolderPath(result.absolutePath), normalizeLocalFolderPath(dir))
  }
})
