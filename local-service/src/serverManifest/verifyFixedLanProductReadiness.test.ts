import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { ProbeLocalHttpUrlResult } from '../network/probeLocalHttpUrl.ts'
import type { ContractLanProbeResult } from '../network/probeContractLanHttpUrl.ts'
import { setNetworkInterfacesProviderForTests } from '../config/networkAccess.ts'
import { verifyFixedLanProductReadiness } from './verifyFixedLanProductReadiness.ts'
import { setTcpPortListenerProbeForTests } from './lanTcpPortListenerProbe.ts'

const fixed = {
  schema: 'servidor-omps-fixed-lan/1' as const,
  expectedLanHost: '192.168.1.100',
  requiredHttpPort: 8080,
  entryPath: '/login',
  allowHttpPortFallback: false as const,
}

afterEach(() => {
  setNetworkInterfacesProviderForTests(null)
  setTcpPortListenerProbeForTests(null)
})

function mockHostAssigned() {
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
}

function okLoopback(status = 200): ProbeLocalHttpUrlResult {
  return { ok: true, responded: true, status, finalUrl: 'http://127.0.0.1/' }
}

describe('verifyFixedLanProductReadiness', () => {
  it('ok quando login, descoberta e contrato batem com 192.168.1.100:8080', async () => {
    mockHostAssigned()
    setTcpPortListenerProbeForTests(async () => ({
      ok: true,
      listening: true,
      listeners: [
        {
          port: 8080,
          localAddress: '0.0.0.0',
          pid: 1,
          processName: 'caddy.exe',
          executablePath: null,
          commandLine: null,
          serviceName: null,
          identityConfidence: 'partial',
        },
      ],
    }))

    const contractProbe = async (url: string): Promise<ContractLanProbeResult> => {
      if (url.includes('/login')) {
        return { ok: true, responded: true, status: 200, finalUrl: url, location: null }
      }
      if (url.includes('server-connection.json')) {
        return {
          ok: true,
          responded: true,
          status: 200,
          finalUrl: url,
          location: null,
          bodyText: JSON.stringify({
            schema: 'acomopms-server-connection/1',
            lan: {
              host: '192.168.1.100',
              httpPort: 8080,
              origin: 'http://192.168.1.100:8080',
              loginUrl: 'http://192.168.1.100:8080/login',
            },
          }),
        }
      }
      return { ok: false, responded: false, reason: 'TRANSPORT_ERROR', message: 'unexpected' }
    }

    const result = await verifyFixedLanProductReadiness(fixed, {
      loopbackProbe: async () => okLoopback(200),
      contractProbe: async (url, _expected, opts) => contractProbe(url),
      tcpProbe: async () => ({
        ok: true,
        listening: true,
        listeners: [
          {
            port: 8080,
            localAddress: '0.0.0.0',
            pid: 1,
            processName: 'caddy.exe',
            executablePath: null,
            commandLine: null,
            serviceName: null,
            identityConfidence: 'partial',
          },
        ],
      }),
    })
    assert.equal(result.ok, true)
    assert.ok(result.checks.some((c) => c.id === 'fixed.http.login' && c.ok))
    assert.ok(result.checks.some((c) => c.id === 'fixed.http.server-connection' && c.ok))
  })

  it('aceita login HTTP 401 como resposta legítima da aplicação', async () => {
    mockHostAssigned()
    const result = await verifyFixedLanProductReadiness(fixed, {
      loopbackProbe: async () => okLoopback(200),
      contractProbe: async (url) => {
        if (url.includes('/login')) {
          return { ok: true, responded: true, status: 401, finalUrl: url, location: null }
        }
        return {
          ok: true,
          responded: true,
          status: 200,
          finalUrl: url,
          location: null,
          bodyText: JSON.stringify({
            schema: 'acomopms-server-connection/1',
            lan: {
              host: '192.168.1.100',
              httpPort: 8080,
              origin: 'http://192.168.1.100:8080',
              loginUrl: 'http://192.168.1.100:8080/login',
            },
          }),
        }
      },
      tcpProbe: async () => ({ ok: true, listening: true, listeners: [] }),
    })
    assert.equal(result.checks.find((c) => c.id === 'fixed.http.login')?.ok, true)
  })

  it('reprova quando IP contratual não está atribuído', async () => {
    setNetworkInterfacesProviderForTests(() => ({
      WiFi: [
        {
          address: '10.0.0.2',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:01',
          internal: false,
          cidr: '10.0.0.2/24',
        },
      ],
    }))
    const result = await verifyFixedLanProductReadiness(fixed, {
      loopbackProbe: async () => okLoopback(),
      contractProbe: async () => ({
        ok: false,
        responded: false,
        reason: 'HOST_NOT_ASSIGNED',
        message: 'host',
      }),
      tcpProbe: async () => ({ ok: true, listening: false, listeners: [] }),
    })
    assert.equal(result.ok, false)
    assert.match(result.message, /fixed\.host\.assigned/)
  })

  it('reprova server-connection com porta alternativa', async () => {
    mockHostAssigned()
    const result = await verifyFixedLanProductReadiness(fixed, {
      loopbackProbe: async () => okLoopback(),
      contractProbe: async (url) => {
        if (url.includes('/login')) {
          return { ok: true, responded: true, status: 200, finalUrl: url, location: null }
        }
        return {
          ok: true,
          responded: true,
          status: 200,
          finalUrl: url,
          location: null,
          bodyText: JSON.stringify({
            schema: 'acomopms-server-connection/1',
            lan: {
              host: '192.168.1.100',
              httpPort: 8081,
              origin: 'http://192.168.1.100:8081',
              loginUrl: 'http://192.168.1.100:8081/login',
            },
          }),
        }
      },
      tcpProbe: async () => ({ ok: true, listening: true, listeners: [] }),
    })
    assert.equal(result.ok, false)
    assert.match(result.message, /fixed\.connection|server-connection/i)
  })
})
