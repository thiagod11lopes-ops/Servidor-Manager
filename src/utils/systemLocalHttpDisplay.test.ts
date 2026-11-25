import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isLoopbackHttpOrHttpsUrl,
  localHttpReachableLabel,
  resolveDisplayLocalProbeUrl,
} from './systemLocalHttpDisplay.ts'

describe('localHttpReachableLabel', () => {
  it('mapeia true false e null/ausente', () => {
    assert.equal(localHttpReachableLabel(true), 'HTTP local respondeu')
    assert.equal(localHttpReachableLabel(false), 'HTTP local sem resposta')
    assert.equal(localHttpReachableLabel(null), 'HTTP local não verificado')
    assert.equal(localHttpReachableLabel(undefined), 'HTTP local não verificado')
  })
})

describe('resolveDisplayLocalProbeUrl', () => {
  it('aceita loopback http e https', () => {
    assert.equal(
      resolveDisplayLocalProbeUrl('http://127.0.0.1:8080/login'),
      'http://127.0.0.1:8080/login',
    )
    assert.equal(
      resolveDisplayLocalProbeUrl('http://localhost:3000/'),
      'http://localhost:3000/',
    )
  })

  it('rejeita URL remota ou invalida', () => {
    assert.equal(resolveDisplayLocalProbeUrl('http://192.168.0.1:8080/'), null)
    assert.equal(resolveDisplayLocalProbeUrl('ftp://127.0.0.1/'), null)
    assert.equal(resolveDisplayLocalProbeUrl(undefined), null)
  })
})

describe('isLoopbackHttpOrHttpsUrl', () => {
  it('aceita ::1', () => {
    assert.equal(isLoopbackHttpOrHttpsUrl('http://[::1]:8080/'), true)
  })
})
