import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildLanHttpPortScanOrder,
  LAN_HTTP_PORT_SCAN_MAX,
  selectLanHttpPortFromScan,
} from './lanHttpPortGuard.ts'

describe('buildLanHttpPortScanOrder', () => {
  it('prioriza porta registrada e depois base+offset', () => {
    const order = buildLanHttpPortScanOrder(8080, 4, 8082)
    assert.deepEqual(order.slice(0, 5), [8082, 8080, 8081, 8083])
  })
})

describe('selectLanHttpPortFromScan', () => {
  it('escolhe 8081 quando 8080 está em uso por terceiro', () => {
    const claims = new Map<number, string[]>()
    const picked = selectLanHttpPortFromScan({
      candidates: buildLanHttpPortScanOrder(8080, LAN_HTTP_PORT_SCAN_MAX, null),
      listeningPorts: new Set([8080]),
      claimsByPort: claims,
    })
    assert.equal('port' in picked && picked.port, 8081)
  })

  it('respeita claim de outro systemId na faixa', () => {
    const claims = new Map<number, string[]>([[8080, ['42765375-a486-4541-8ef0-b028cb80556f']]])
    const picked = selectLanHttpPortFromScan({
      candidates: buildLanHttpPortScanOrder(8080, 5, null),
      listeningPorts: new Set(),
      claimsByPort: claims,
    })
    assert.equal('port' in picked && picked.port, 8081)
  })

  it('reutiliza porta registrada em escuta (stack deste systemId)', () => {
    const picked = selectLanHttpPortFromScan({
      candidates: [8082, 8080, 8081],
      listeningPorts: new Set([8082]),
      claimsByPort: new Map(),
      recordedPortForSystem: 8082,
    })
    assert.equal('port' in picked && picked.port, 8082)
  })

  it('falha quando faixa inteira ocupada', () => {
    const listening = new Set([8080, 8081, 8082])
    const picked = selectLanHttpPortFromScan({
      candidates: [8080, 8081, 8082],
      listeningPorts: listening,
      claimsByPort: new Map(),
    })
    assert.equal('error' in picked, true)
  })
})
