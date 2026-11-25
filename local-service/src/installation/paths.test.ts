import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getSystemsRoot } from './paths.ts'

describe('getSystemsRoot', () => {
  it('no Windows mantém padrão C:\\ServidorManager\\systems sem env', () => {
    if (process.platform !== 'win32') return
    const prev = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    try {
      assert.match(getSystemsRoot(), /ServidorManager[\\/]systems$/i)
    } finally {
      if (prev) process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prev
    }
  })

  it('respeita SERVIDOR_MANAGER_SYSTEMS_ROOT', () => {
    const prev = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = process.platform === 'win32' ? 'D:\\Test\\systems' : '/tmp/sm-systems'
    try {
      assert.equal(getSystemsRoot(), process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT)
    } finally {
      if (prev) process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prev
      else delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    }
  })
})
