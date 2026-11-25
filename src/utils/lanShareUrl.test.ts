import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isInvalidLanShareHost, isRfc1918Host, isUnofficialUserAccessUrl } from './lanShareUrl.ts'

test('isInvalidLanShareHost flags CGNAT', () => {
  assert.equal(isInvalidLanShareHost('100.102.248.103'), true)
  assert.equal(isInvalidLanShareHost('192.168.0.17'), false)
})

test('isRfc1918Host accepts private LAN', () => {
  assert.equal(isRfc1918Host('192.168.0.17'), true)
  assert.equal(isRfc1918Host('100.102.248.103'), false)
})

test('isUnofficialUserAccessUrl rejeita CGNAT e preview 4173 em manifest-lan', () => {
  assert.equal(isUnofficialUserAccessUrl('http://100.102.248.103:4173/login', 8080, 'manifest-lan'), true)
  assert.equal(isUnofficialUserAccessUrl('http://192.168.0.17:8080/login', 8080, 'manifest-lan'), false)
})
