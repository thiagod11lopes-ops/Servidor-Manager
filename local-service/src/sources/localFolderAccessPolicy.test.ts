import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  assertLocalFolderPathAllowed,
  isBrowserUploadSessionPath,
} from './localFolderAccessPolicy.ts'

test('isBrowserUploadSessionPath accepts uuid session folder', async () => {
  const managerRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-mgr-'))
  const previous = process.env.SERVIDOR_MANAGER_DATA_ROOT
  process.env.SERVIDOR_MANAGER_DATA_ROOT = managerRoot
  try {
    const sessionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const sessionDir = path.join(managerRoot, 'staging', 'browser-upload', sessionId)
    await fs.mkdir(sessionDir, { recursive: true })
    assert.equal(isBrowserUploadSessionPath(sessionDir), true)
    assert.equal(assertLocalFolderPathAllowed(sessionDir).ok, true)
  } finally {
    if (previous === undefined) delete process.env.SERVIDOR_MANAGER_DATA_ROOT
    else process.env.SERVIDOR_MANAGER_DATA_ROOT = previous
    await fs.rm(managerRoot, { recursive: true, force: true })
  }
})

test('assertLocalFolderPathAllowed rejects systems directory', async () => {
  const managerRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-mgr-'))
  const previous = process.env.SERVIDOR_MANAGER_DATA_ROOT
  process.env.SERVIDOR_MANAGER_DATA_ROOT = managerRoot
  try {
    const systemsDir = path.join(managerRoot, 'systems', '00000000-0000-4000-8000-000000000001')
    await fs.mkdir(systemsDir, { recursive: true })
    const result = assertLocalFolderPathAllowed(systemsDir)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'LOCAL_PATH_FORBIDDEN')
  } finally {
    if (previous === undefined) delete process.env.SERVIDOR_MANAGER_DATA_ROOT
    else process.env.SERVIDOR_MANAGER_DATA_ROOT = previous
    await fs.rm(managerRoot, { recursive: true, force: true })
  }
})

test('assertLocalFolderPathAllowed allows path outside manager root', () => {
  const result = assertLocalFolderPathAllowed('C:\\Users\\Public\\demo-project')
  assert.equal(result.ok, true)
})
