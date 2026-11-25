import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getPhysicalLanIPv4,
  isRfc1918IPv4,
  isCarrierGradeNatIPv4,
  listPhysicalLanIPv4Candidates,
} from './networkAccess.ts'

describe('isCarrierGradeNatIPv4', () => {
  it('identifica faixa 100.64–127.x', () => {
    assert.equal(isCarrierGradeNatIPv4('100.102.248.103'), true)
    assert.equal(isCarrierGradeNatIPv4('100.63.0.1'), false)
    assert.equal(isCarrierGradeNatIPv4('192.168.1.5'), false)
  })
})

describe('listPhysicalLanIPv4Candidates', () => {
  it('nao escolhe CGNAT quando existe Wi‑Fi/Ethernet RFC1918', () => {
    const candidates = listPhysicalLanIPv4Candidates()
    for (const c of candidates) {
      assert.equal(isCarrierGradeNatIPv4(c.address), false)
    }
    const ip = getPhysicalLanIPv4()
    if (ip) {
      assert.equal(isCarrierGradeNatIPv4(ip), false)
    }
  })
})

describe('isRfc1918IPv4', () => {
  it('reconhece redes privadas comuns', () => {
    assert.equal(isRfc1918IPv4('192.168.0.10'), true)
    assert.equal(isRfc1918IPv4('10.0.0.1'), true)
    assert.equal(isRfc1918IPv4('172.16.5.1'), true)
    assert.equal(isRfc1918IPv4('172.15.0.1'), false)
    assert.equal(isRfc1918IPv4('8.8.8.8'), false)
  })
})
