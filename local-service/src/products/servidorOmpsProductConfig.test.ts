import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildFixedLanUrls,
  parseServidorOmpsProductConfig,
  listServidorOmpsProductConfigFileCandidates,
  readActiveServidorOmpsProductConfig,
  readServidorOmpsProductConfigFromInstallRoot,
  resolveOmpsUsuarioDefaultStartUrl,
} from './servidorOmpsProductConfig.ts'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const sourceProductPath = path.join(repoRoot, 'resources-packaging', 'servidor-omps-product.json')

test('resources-packaging/servidor-omps-product.json define acesso local do Usuário OMPS', async () => {
  const raw = JSON.parse(await fs.readFile(sourceProductPath, 'utf8'))
  const parsed = parseServidorOmpsProductConfig(raw)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  assert.equal(parsed.config.lanAccess?.lanHostMode, 'local')
  assert.equal(parsed.config.lanAccess?.requiredHttpPort, 8080)
  assert.equal(parsed.config.clientDesktopDefaults?.lanDiscovery, false)

  const loginUrl = resolveOmpsUsuarioDefaultStartUrl(parsed.config)
  assert.equal(loginUrl, 'http://127.0.0.1:8080/login')
})

test('parseServidorOmpsProductConfig rejeita allowHttpPortFallback true', () => {
  const parsed = parseServidorOmpsProductConfig({
    schema: 'servidor-omps-product/2',
    productLine: 'servidor-omps',
    displayName: 'Servidor OMPS',
    fixedLanAccess: {
      schema: 'servidor-omps-fixed-lan/1',
      expectedLanHost: '192.168.1.100',
      requiredHttpPort: 8080,
      entryPath: '/login',
      allowHttpPortFallback: true,
    },
  })
  assert.equal(parsed.ok, false)
})

test('readServidorOmpsProductConfigFromInstallRoot ausente retorna null', async () => {
  const dir = await fs.mkdtemp(path.join(path.dirname(sourceProductPath), 'sm-no-product-'))
  const result = await readServidorOmpsProductConfigFromInstallRoot(dir)
  assert.equal(result, null)
})

test('readActiveServidorOmpsProductConfig encontra resources-packaging no repositório', async () => {
  const prev = process.env.SERVIDOR_MANAGER_INSTALL_ROOT
  process.env.SERVIDOR_MANAGER_INSTALL_ROOT = path.join(repoRoot, 'release', 'win-unpacked')
  try {
    const config = await readActiveServidorOmpsProductConfig()
    assert.ok(config)
    assert.equal(config.productLine, 'servidor-omps')
  } finally {
    if (prev === undefined) delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
    else process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prev
  }
})

test('listServidorOmpsProductConfigFileCandidates inclui packaging e OMPS win-unpacked', () => {
  const candidates = listServidorOmpsProductConfigFileCandidates()
  assert.ok(
    candidates.some((p) => p.replace(/\\/g, '/').endsWith('resources-packaging/servidor-omps-product.json')),
  )
  assert.ok(
    candidates.some((p) =>
      p.replace(/\\/g, '/').endsWith('release/servidor-omps/win-unpacked/resources/servidor-omps-product.json'),
    ),
  )
})

test('readServidorOmpsProductConfigFromInstallRoot lê JSON válido em resources/', async () => {
  const dir = await fs.mkdtemp(path.join(path.dirname(sourceProductPath), 'sm-product-'))
  const resources = path.join(dir, 'resources')
  await fs.mkdir(resources, { recursive: true })
  await fs.copyFile(sourceProductPath, path.join(resources, 'servidor-omps-product.json'))
  const result = await readServidorOmpsProductConfigFromInstallRoot(dir)
  assert.ok(result)
  assert.equal(result?.lanAccess?.requiredHttpPort, 8080)
})
