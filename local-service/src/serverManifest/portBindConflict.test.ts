import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectPortBindConflict, isRecoverableLanHttpPortFailure } from './portBindConflict.ts'

describe('detectPortBindConflict', () => {
  it('detecta mensagens Caddy/Docker comuns', () => {
    assert.equal(detectPortBindConflict('Error: listen tcp 0.0.0.0:8080: bind: address already in use'), true)
    assert.equal(detectPortBindConflict('port is already allocated'), true)
    assert.equal(detectPortBindConflict('falha genérica'), false)
  })
})

describe('isRecoverableLanHttpPortFailure', () => {
  it('detecta throw PT do start-servidor-lan.ps1', () => {
    const pt =
      'A porta 8080 ja esta em uso pelo processo 1234 (other.exe). Este script nao encerra processos de outra instalacao.'
    assert.equal(isRecoverableLanHttpPortFailure(pt), true)
  })

  it('ignora falhas genéricas não relacionadas a porta', () => {
    assert.equal(isRecoverableLanHttpPortFailure('Caddy validate falhou (codigo 1)'), false)
    assert.equal(isRecoverableLanHttpPortFailure('Rode build-producao-lan.ps1 antes.'), false)
  })
})
