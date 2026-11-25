import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseDockerNetworkSettingsPortsJson } from './supabaseDockerHostPorts.ts'

describe('parseDockerNetworkSettingsPortsJson', () => {
  it('extrai HostPort de bindings Supabase (54322)', () => {
    const raw = JSON.stringify({
      '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '54322' }],
      '8000/tcp': [{ HostIp: '0.0.0.0', HostPort: '54321' }],
    })
    const ports = parseDockerNetworkSettingsPortsJson(raw)
    assert.deepEqual([...ports].sort((a, b) => a - b), [54321, 54322])
  })

  it('retorna vazio para JSON inválido', () => {
    assert.deepEqual(parseDockerNetworkSettingsPortsJson('not-json'), [])
  })
})
