import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { describe, it } from 'node:test'
import {
  OMPS_LAN_DISCOVERY_UDP_PORT,
  buildOmpsLanDiscoveryRequestBuffer,
  parseOmpsLanDiscoveryResponse,
} from './ompsLanDiscoveryProtocol.ts'
import { startOmpsLanDiscoveryServer, stopOmpsLanDiscoveryServer } from './ompsLanDiscoveryServer.ts'

describe('ompsLanDiscoveryServer', () => {
  it('escuta UDP e responde ao pedido válido', async () => {
    const systemId = 'test-discovery-udp'
    const started = await startOmpsLanDiscoveryServer({
      systemId,
      getAdvertisement: () => ({
        host: '127.0.0.1',
        httpPort: 8080,
        entryPath: '/login',
        instanceId: 'inst-test',
        displayName: 'Teste',
      }),
    })
    assert.equal(started.ok, true)

    const response = await new Promise<string>((resolve, reject) => {
      const client = dgram.createSocket('udp4')
      const timer = setTimeout(() => {
        client.close()
        reject(new Error('timeout aguardando resposta UDP'))
      }, 3_000)

      client.on('message', (msg) => {
        clearTimeout(timer)
        client.close()
        resolve(msg.toString('utf8'))
      })

      client.send(buildOmpsLanDiscoveryRequestBuffer(), OMPS_LAN_DISCOVERY_UDP_PORT, '127.0.0.1', (err) => {
        if (err) {
          clearTimeout(timer)
          client.close()
          reject(err)
        }
      })
    })

    const parsed = parseOmpsLanDiscoveryResponse(JSON.parse(response))
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.value.instanceId, 'inst-test')
      assert.equal(parsed.value.httpPort, 8080)
    }

    await stopOmpsLanDiscoveryServer(systemId)
  })
})
