import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLanUrlsFromProduct,
  normalizeLanAccessFromProduct,
  productUsesLanDiscovery,
  resolveStartUrlWithFixedLanDiscovery,
} from '../lib/fixed-lan-product.mjs'

const sampleProductV3 = {
  schema: 'servidor-omps-product/3',
  productLine: 'servidor-omps',
  lanAccess: {
    schema: 'servidor-omps-lan/2',
    lanHostMode: 'auto',
    requiredHttpPort: 8080,
    discoveryUdpPort: 47808,
    entryPath: '/login',
    allowHttpPortFallback: true,
    httpPortScanMaxOffset: 20,
  },
  clientDesktopDefaults: { lanDiscovery: true, discoverConnection: true },
}

test('buildLanUrlsFromProduct com host resolvido', () => {
  const u = buildLanUrlsFromProduct(sampleProductV3, '192.168.0.42')
  assert.equal(u.loginUrl, 'http://192.168.0.42:8080/login')
})

test('produto auto usa descoberta LAN', () => {
  assert.equal(productUsesLanDiscovery(sampleProductV3), true)
  const lan = normalizeLanAccessFromProduct(sampleProductV3)
  assert.equal(lan.discoveryUdpPort, 47808)
})

test('discovery rejeita porta fora da faixa', () => {
  const fixed = {
    ...buildLanUrlsFromProduct(sampleProductV3, '192.168.0.42'),
    lanAccess: normalizeLanAccessFromProduct(sampleProductV3),
  }
  assert.throws(
    () => resolveStartUrlWithFixedLanDiscovery(fixed, 'http://192.168.0.42:9090/login', fixed.loginUrl),
    /faixa/,
  )
})

test('discovery aceita porta alternativa na faixa', () => {
  const fixed = {
    ...buildLanUrlsFromProduct(sampleProductV3, '192.168.0.42'),
    lanAccess: normalizeLanAccessFromProduct(sampleProductV3),
  }
  const r = resolveStartUrlWithFixedLanDiscovery(fixed, 'http://192.168.0.42:8083/login', fixed.loginUrl)
  assert.equal(r.source, 'server-connection.json')
})
