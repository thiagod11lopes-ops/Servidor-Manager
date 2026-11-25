import test from 'node:test'
import assert from 'node:assert/strict'
import { listOmpsLanDiscoveryBroadcastTargets } from '../lib/discover-lan-interfaces.mjs'

test('listOmpsLanDiscoveryBroadcastTargets ignora interfaces virtuais conhecidas', () => {
  const targets = listOmpsLanDiscoveryBroadcastTargets()
  for (const t of targets) {
    assert.match(t.interfaceName, /^(?!.*(?:WSL|vEthernet|VirtualBox|VMware|Hyper-V)).*$/i)
    assert.ok(t.broadcast.split('.').length === 4)
    assert.ok(t.address.split('.').length === 4)
  }
})
