import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { setNetworkInterfacesProviderForTests } from '../config/networkAccess.ts'
import {
  verifyExpectedLanHostOnMachine,
  verifyServidorOmpsFixedLanHostReady,
  type ServidorOmpsFixedLanPolicy,
} from './servidorOmpsFixedLanRuntime.ts'

afterEach(() => {
  setNetworkInterfacesProviderForTests(null)
})

const samplePolicy: ServidorOmpsFixedLanPolicy = {
  config: {
    schema: 'servidor-omps-product/3',
    productLine: 'servidor-omps',
    displayName: 'Servidor OMPS',
    lanAccess: {
      schema: 'servidor-omps-lan/2',
      lanHostMode: 'auto',
      requiredHttpPort: 8080,
      discoveryUdpPort: 47808,
      entryPath: '/login',
      allowHttpPortFallback: false,
    },
  },
  fixed: {
    schema: 'servidor-omps-lan/2',
    lanHostMode: 'auto',
    requiredHttpPort: 8080,
    discoveryUdpPort: 47808,
    entryPath: '/login',
    allowHttpPortFallback: false,
  },
  resolvedHost: '10.0.0.5',
  hostSelectionAmbiguous: false,
  urls: {
    baseUrl: 'http://10.0.0.5:8080',
    loginUrl: 'http://10.0.0.5:8080/login',
    origin: 'http://10.0.0.5:8080',
    host: '10.0.0.5',
    port: 8080,
    discoveryUdpPort: 47808,
    lanHostMode: 'auto',
  },
}

describe('verifyExpectedLanHostOnMachine', () => {
  it('mensagem acionável quando IP ausente', () => {
    setNetworkInterfacesProviderForTests(() => ({
      LAN: [
        {
          address: '10.0.0.5',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: '10.0.0.5/24',
        },
      ],
    }))
    const result = verifyExpectedLanHostOnMachine('192.168.1.100')
    assert.equal(result.ok, false)
    if (result.ok) assert.fail('expected failure')
    assert.match(result.message, /192\.168\.1\.100/)
  })

  it('verifyServidorOmpsFixedLanHostReady ok com IPv4 detectado', async () => {
    setNetworkInterfacesProviderForTests(() => ({
      Ethernet: [
        {
          address: '10.0.0.5',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: '10.0.0.5/24',
        },
      ],
    }))
    const result = await verifyServidorOmpsFixedLanHostReady(samplePolicy)
    assert.equal(result.ok, true)
  })
})
