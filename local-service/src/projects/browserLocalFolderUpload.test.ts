import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { applyBrowserLocalFolderUpload } from './browserLocalFolderUpload.ts'

test('applyBrowserLocalFolderUpload stages valid project', async () => {
  const managerRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-upload-'))
  const previous = process.env.SERVIDOR_MANAGER_DATA_ROOT
  process.env.SERVIDOR_MANAGER_DATA_ROOT = managerRoot
  try {
    const result = await applyBrowserLocalFolderUpload({
      uploadId: '11111111-2222-4333-8444-555555555555',
      files: [
        {
          filename: 'package.json',
          data: Buffer.from('{"name":"browser-demo"}', 'utf8'),
        },
      ],
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.match(result.localFolderPath, /browser-upload[\\/]11111111-2222-4333-8444-555555555555/i)
      const pkg = await fs.readFile(path.join(result.localFolderPath, 'package.json'), 'utf8')
      assert.match(pkg, /browser-demo/)
    }
  } finally {
    if (previous === undefined) delete process.env.SERVIDOR_MANAGER_DATA_ROOT
    else process.env.SERVIDOR_MANAGER_DATA_ROOT = previous
    await fs.rm(managerRoot, { recursive: true, force: true })
  }
})
