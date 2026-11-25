import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { parseProjectInstallSource } from './projectInstallSource.ts'
import { localProjectFolderErrorMessage } from './localFolderSource.ts'

test('parseProjectInstallSource resolves browser staging folder', async () => {
  const managerRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-install-src-'))
  const previous = process.env.SERVIDOR_MANAGER_DATA_ROOT
  process.env.SERVIDOR_MANAGER_DATA_ROOT = managerRoot
  try {
    const sessionId = 'a9eabe32-02eb-4cfc-a22f-dcffa5d7eaf2'
    const sessionDir = path.join(managerRoot, 'staging', 'browser-upload', sessionId)
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(path.join(sessionDir, 'server-manifest.json'), '{"name":"demo"}', 'utf8')

    const parsed = await parseProjectInstallSource({ localFolderPath: sessionDir })
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.source.kind, 'localFolder')
      assert.match(parsed.source.sourceUrl, /^local-folder:/)
    }
  } finally {
    if (previous === undefined) delete process.env.SERVIDOR_MANAGER_DATA_ROOT
    else process.env.SERVIDOR_MANAGER_DATA_ROOT = previous
    await fs.rm(managerRoot, { recursive: true, force: true })
  }
})

test('parseProjectInstallSource returns specific error for missing manifest structure', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-empty-local-'))
  const parsed = await parseProjectInstallSource({ localFolderPath: dir })
  assert.equal(parsed.ok, false)
  if (!parsed.ok) {
    assert.equal(parsed.message, localProjectFolderErrorMessage('LOCAL_PROJECT_STRUCTURE_MISSING'))
  }
  await fs.rm(dir, { recursive: true, force: true })
})

test('parseProjectInstallSource still validates git url for remote origin', async () => {
  const parsed = await parseProjectInstallSource({ sourceUrl: 'https://github.com/example/demo.git' })
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.source.kind, 'git')
})
