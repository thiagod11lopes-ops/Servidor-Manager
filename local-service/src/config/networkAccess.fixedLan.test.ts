import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  checkIpv4AssignedOnLocalMachine,
  isIpv4AssignedOnLocalMachine,
  setNetworkInterfacesProviderForTests,
} from './networkAccess.ts'

afterEach(() => {
  setNetworkInterfacesProviderForTests(null)
})

describe('checkIpv4AssignedOnLocalMachine (mock de interfaces)', () => {
  it('aprova quando o IPv4 esperado está atribuído localmente', () => {
    setNetworkInterfacesProviderForTests(() => ({
      Ethernet: [
        {
          address: '192.168.1.100',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: '192.168.1.100/24',
        },
      ],
    }))
    const check = checkIpv4AssignedOnLocalMachine('192.168.1.100')
    assert.equal(check.ok, true)
    assert.equal(isIpv4AssignedOnLocalMachine('192.168.1.100'), true)
  })

  it('reprova quando o IPv4 obrigatório não está entre os endereços locais', () => {
    setNetworkInterfacesProviderForTests(() => ({
      WiFi: [
        {
          address: '192.168.1.50',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:01',
          internal: false,
          cidr: '192.168.1.50/24',
        },
      ],
    }))
    const check = checkIpv4AssignedOnLocalMachine('192.168.1.100')
    assert.equal(check.ok, false)
    if (check.ok) assert.fail('expected failure')
    assert.equal(check.reason, 'not_assigned')
    assert.equal(isIpv4AssignedOnLocalMachine('192.168.1.100'), false)
  })

  it('falha segura quando a consulta de interfaces lança erro', () => {
    setNetworkInterfacesProviderForTests(() => {
      throw new Error('simulated OS failure')
    })
    const check = checkIpv4AssignedOnLocalMachine('192.168.1.100')
    assert.equal(check.ok, false)
    if (check.ok) assert.fail('expected failure')
    assert.equal(check.reason, 'interfaces_unavailable')
    assert.match(check.message, /consultar as interfaces/)
    assert.equal(isIpv4AssignedOnLocalMachine('192.168.1.100'), false)
  })
})
