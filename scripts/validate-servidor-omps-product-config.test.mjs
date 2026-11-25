import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildLanUrlsFromProduct,
  loadServidorOmpsProductSource,
  normalizeLanAccessFromProduct,
} from './omps-fixed-lan-contract.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('instalador genérico e Servidor OMPS usam appId e artefato NSIS distintos', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  const yml = await fs.readFile(path.join(root, 'electron-builder.servidor-omps.yml'), 'utf8')

  assert.equal(pkg.build.appId, 'com.servidor.manager')
  assert.equal(pkg.build.nsis.artifactName, 'servidor.${ext}')
  assert.match(yml, /appId:\s*com\.servidor\.omps/)
  assert.match(yml, /artifactName:\s*Servidor OMPS\.\$\{ext\}/)
  assert.doesNotMatch(yml, /artifactName:\s*servidor\.\$\{ext\}/)
  assert.match(yml, /installer-servidor-omps\.nsh/)
})

test('pipeline Servidor OMPS usa build de marca OMPS (não build genérico)', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  assert.match(pkg.scripts['package:servidor-omps'], /build:app:omps/)
  assert.match(pkg.scripts['build:app:omps'], /--omps/)
})

test('servidor-omps-product.json define acesso local (127.0.0.1), HTTP 8080', async () => {
  const product = loadServidorOmpsProductSource()
  assert.equal(product.schema, 'servidor-omps-product/3')
  const lan = normalizeLanAccessFromProduct(product)
  assert.equal(lan.lanHostMode, 'local')
  assert.equal(lan.requiredHttpPort, 8080)
  assert.equal(lan.discoveryUdpPort, 47808)
  assert.equal(lan.allowHttpPortFallback, true)
  assert.equal(lan.httpPortScanMaxOffset, 20)
  const urls = buildLanUrlsFromProduct(product, null)
  assert.equal(urls.baseUrl, 'http://127.0.0.1:8080')
  assert.equal(urls.loginUrl, 'http://127.0.0.1:8080/login')
  assert.equal(product.clientDesktopDefaults.discoverConnection, false)
  assert.equal(product.clientDesktopDefaults.lanDiscovery, false)
})
