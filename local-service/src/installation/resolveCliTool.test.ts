import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { buildSubprocessPath, envWithRefreshedPath } from './resolveCliTool.ts'

describe('resolveCliTool — PATH ampliado', () => {
  it('inclui npm global no Windows', () => {
    if (process.platform !== 'win32') return
    const appData = 'C:\\Users\\test\\AppData\\Roaming'
    const merged = buildSubprocessPath({ ...process.env, APPDATA: appData, PATH: 'C:\\Windows\\System32' })
    assert.match(merged, /AppData\\Roaming\\npm/i)
    assert.match(merged, /System32/i)
  })

  it('envWithRefreshedPath define PATH', () => {
    const env = envWithRefreshedPath({ FOO: 'bar', PATH: process.env.PATH })
    assert.equal(env.FOO, 'bar')
    assert.ok(env.PATH && env.PATH.length > 0)
    if (process.platform === 'win32') {
      assert.ok(env.PATH.split(path.delimiter).length >= 2)
    }
  })
})
