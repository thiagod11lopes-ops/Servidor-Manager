import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isInvalidLanAdvertiseHost, sanitizePublicLoginUrl } from './lanPublicUrl.ts'

describe('isInvalidLanAdvertiseHost', () => {
  it('rejeita CGNAT e loopback', () => {
    assert.equal(isInvalidLanAdvertiseHost('100.102.248.103'), true)
    assert.equal(isInvalidLanAdvertiseHost('127.0.0.1'), true)
    assert.equal(isInvalidLanAdvertiseHost('pc.tail123.ts.net'), true)
  })

  it('aceita RFC1918', () => {
    assert.equal(isInvalidLanAdvertiseHost('192.168.0.17'), false)
  })
})

describe('sanitizePublicLoginUrl', () => {
  it('substitui host CGNAT e porta preview pela porta Caddy quando há LAN detectável', () => {
    const out = sanitizePublicLoginUrl('http://100.102.248.103:4173/login', 8080)
    if (out === null) {
      // Ambiente CI sem interface LAN — skip assert de IP
      return
    }
    assert.match(out, /^http:\/\/192\.168\.\d+\.\d+:8080\/login$/)
    assert.doesNotMatch(out, /100\.102/)
    assert.doesNotMatch(out, /:4173/)
  })

  it('preserva URL RFC1918 com porta correta', () => {
    const out = sanitizePublicLoginUrl('http://192.168.0.44:8080/login', 8080)
    assert.equal(out, 'http://192.168.0.44:8080/login')
  })
})
