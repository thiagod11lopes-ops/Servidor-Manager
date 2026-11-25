import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isLegacyOmpsDesktopStartUrl } from '../lib/legacy-desktop-config.mjs'
import {
  buildDesktopConfigSearchPaths,
  loadDesktopConfig,
  migrateLegacyOmpsDesktopConfigFile,
} from '../lib/load-config.mjs'
import { parseDesktopConfigText, writeDesktopConfigObject } from '../lib/desktop-config-file.mjs'
const sampleProduct = {
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
  clientDesktopDefaults: {
    schema: 'omps-usuario-client-defaults/2',
    windowTitle: 'AcompOPMS',
    discoverConnection: true,
    lanDiscovery: true,
    startUrlFromLanAccess: true,
  },
}

test('URL legada GitHub Pages é reconhecida', () => {
  assert.equal(
    isLegacyOmpsDesktopStartUrl('https://thiagod11lopes-ops.github.io/AcompSolemp/'),
    true,
  )
  assert.equal(isLegacyOmpsDesktopStartUrl('http://192.168.1.100:8080/login'), false)
})

test('buildDesktopConfigSearchPaths prioriza pasta do executável', () => {
  const paths = buildDesktopConfigSearchPaths({
    cwd: 'C:\\app\\resources\\app.asar',
    execDir: 'C:\\Users\\X\\AppData\\Local\\AcompOPMS',
  })
  assert.equal(paths[0], 'C:\\Users\\X\\AppData\\Local\\AcompOPMS\\acomopms-desktop.config.json')
})

test('migra config legada para contrato LAN fixo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omps-cfg-'))
  const cfg = join(dir, 'acomopms-desktop.config.json')
  writeFileSync(
    cfg,
    `${JSON.stringify({ startUrl: 'https://thiagod11lopes-ops.github.io/AcompSolemp/' })}\n`,
  )
  const migrated = migrateLegacyOmpsDesktopConfigFile(cfg, sampleProduct)
  assert.ok(migrated)
  const onDisk = JSON.parse(readFileSync(cfg, 'utf8'))
  assert.equal(onDisk.lanDiscovery, true)
  assert.equal(onDisk.discoverConnection, true)
  assert.ok(readdirSync(dir).some((f) => f.includes('legacy-backup')))
})

test('loadDesktopConfig migra AppData legado quando produto embutido (override teste)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omps-load-'))
  const cfg = join(dir, 'acomopms-desktop.config.json')
  writeFileSync(
    cfg,
    `${JSON.stringify({ startUrl: 'https://thiagod11lopes-ops.github.io/AcompSolemp/' })}\n`,
  )
  const loaded = loadDesktopConfig({
    explicitPath: cfg,
    productOverride: sampleProduct,
  })
  assert.equal(loaded.lanDiscovery, true)
  assert.match(loaded.source, /migrado de URL legada/)
})

test('config com lastKnownOrigin carrega sem erro', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omps-new-'))
  const cfg = join(dir, 'acomopms-desktop.config.json')
  writeFileSync(
    cfg,
    `${JSON.stringify({ lastKnownOrigin: 'http://192.168.0.10:8080', discoverConnection: true, lanDiscovery: true })}\n`,
  )
  const loaded = loadDesktopConfig({ explicitPath: cfg, productOverride: sampleProduct })
  assert.equal(loaded.lastKnownOrigin, 'http://192.168.0.10:8080')
})

test('parseDesktopConfigText aceita UTF-8 BOM (PowerShell Set-Content legado)', () => {
  const inner = '{"startUrl":"http://192.168.1.100:8080/login","discoverConnection":true}'
  const withBom = `\uFEFF${inner}`
  const data = parseDesktopConfigText(withBom)
  assert.equal(data.startUrl, 'http://192.168.1.100:8080/login')
})

test('parseDesktopConfigText desembrulha JSON duplamente serializado', () => {
  const inner = { startUrl: 'http://192.168.1.100:8080/login', discoverConnection: true }
  const double = JSON.stringify(JSON.stringify(inner))
  const data = parseDesktopConfigText(double)
  assert.equal(data.startUrl, 'http://192.168.1.100:8080/login')
})

test('loadDesktopConfig recupera JSON inválido com BOM se reconhecível OMPS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omps-bom-'))
  const cfg = join(dir, 'acomopms-desktop.config.json')
  const body = {
    startUrl: 'http://192.168.1.100:8080/login',
    discoverConnection: true,
    windowTitle: 'AcompOPMS',
  }
  writeFileSync(cfg, `\uFEFF${JSON.stringify(body)}\n`, 'utf8')
  const loaded = loadDesktopConfig({ explicitPath: cfg, productOverride: sampleProduct })
  assert.equal(loaded.startUrl, 'http://192.168.1.100:8080/login')
})

test('JSON malformado não OMPS não é recuperado silenciosamente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omps-corrupt-'))
  const cfg = join(dir, 'acomopms-desktop.config.json')
  writeFileSync(cfg, '{ "startUrl": "http://10.0.0.9:8080/login", broken', 'utf8')
  assert.throws(
    () => loadDesktopConfig({ explicitPath: cfg, productOverride: sampleProduct }),
    /JSON inválido/,
  )
})

test('writeDesktopConfigObject grava JSON objeto válido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omps-write-'))
  const cfg = join(dir, 'acomopms-desktop.config.json')
  writeDesktopConfigObject(cfg, {
    startUrl: 'http://192.168.1.100:8080/login',
    discoverConnection: true,
  })
  const data = parseDesktopConfigText(readFileSync(cfg, 'utf8'))
  assert.equal(data.startUrl, 'http://192.168.1.100:8080/login')
  assert.doesNotMatch(readFileSync(cfg, 'utf8'), /^\uFEFF/)
})

test('startUrl manual permanece como dica quando presente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omps-hint-'))
  const cfg = join(dir, 'acomopms-desktop.config.json')
  writeFileSync(cfg, `${JSON.stringify({ startUrl: 'http://10.0.0.5:8080/login', lanDiscovery: true })}\n`)
  const loaded = loadDesktopConfig({ explicitPath: cfg, productOverride: sampleProduct })
  assert.equal(loaded.startUrl, 'http://10.0.0.5:8080/login')
})
