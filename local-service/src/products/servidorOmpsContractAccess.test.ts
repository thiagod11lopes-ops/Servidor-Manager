import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { ContractLanProbeResult } from '../network/probeContractLanHttpUrl.ts'
import { setNetworkInterfacesProviderForTests } from '../config/networkAccess.ts'
import { probeServidorOmpsContractAccess } from './servidorOmpsContractAccess.ts'
import type { ServidorOmpsFixedLanPolicy } from './servidorOmpsFixedLanRuntime.ts'

const policy: ServidorOmpsFixedLanPolicy = {
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
  resolvedHost: '192.168.0.10',
  hostSelectionAmbiguous: false,
  urls: {
    baseUrl: 'http://192.168.0.10:8080',
    loginUrl: 'http://192.168.0.10:8080/login',
    origin: 'http://192.168.0.10:8080',
    host: '192.168.0.10',
    port: 8080,
    discoveryUdpPort: 47808,
    lanHostMode: 'auto',
  },
}

afterEach(() => {
  setNetworkInterfacesProviderForTests(null)
})

function mockHostAssigned() {
  setNetworkInterfacesProviderForTests(() => ({
    Ethernet: [
      {
        address: '192.168.0.10',
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: false,
        cidr: '192.168.0.10/24',
      },
    ],
  }))
}

describe('probeServidorOmpsContractAccess', () => {
  it('marca indisponível quando login não responde', async () => {
    mockHostAssigned()
    const result = await probeServidorOmpsContractAccess(policy, {
      tcpProbe: async () => ({ ok: true, listening: true, listeners: [] }),
      contractProbe: async (url): Promise<ContractLanProbeResult> => {
        if (url.includes('/login')) {
          return { ok: false, responded: false, reason: 'TIMEOUT', message: 'TimeoutError' }
        }
        return { ok: false, responded: false, reason: 'TIMEOUT', message: 'TimeoutError' }
      },
    })
    assert.equal(result.availability, 'unavailable')
    assert.match(result.message, /TimeoutError/)
  })

  it('marca ativo quando login e server-connection.json válidos', async () => {
    mockHostAssigned()
    const connectionBody = JSON.stringify({
      schema: 'acomopms-server-connection/1',
      lan: {
        host: '192.168.0.10',
        httpPort: 8080,
        origin: 'http://192.168.0.10:8080',
        loginUrl: 'http://192.168.0.10:8080/login',
      },
    })
    const result = await probeServidorOmpsContractAccess(policy, {
      tcpProbe: async () => ({ ok: true, listening: true, listeners: [] }),
      contractProbe: async (url): Promise<ContractLanProbeResult> => {
        if (url.includes('/login')) {
          return { ok: true, responded: true, status: 200, finalUrl: url, location: null }
        }
        return {
          ok: true,
          responded: true,
          status: 200,
          finalUrl: url,
          location: null,
          bodyText: connectionBody,
        }
      },
    })
    assert.equal(result.availability, 'active')
    assert.equal(result.loginUrl, 'http://192.168.0.10:8080/login')
    assert.ok(result.lastSuccessAt)
  })
})
