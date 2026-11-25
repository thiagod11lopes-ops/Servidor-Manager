#!/usr/bin/env node
/**
 * Valida win-unpacked e NSIS do Servidor OMPS (sem executar instaladores).
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { path7za } from '7zip-bin'
import {
  collectWinUnpackedFingerprint,
  sha256FileAsync,
} from './servidor-omps-artifact-fingerprint.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const releaseDir = join(root, 'release', 'servidor-omps')
const unpackedRoot = join(releaseDir, 'win-unpacked')
const nsisPath = join(releaseDir, 'Servidor OMPS.exe')

function listNsisArchiveEntries(nsisFile) {
  const r = spawnSync(path7za, ['l', '-slt', nsisFile], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) {
    throw new Error(`7za list falhou: ${r.stderr || r.stdout}`)
  }
  const paths = []
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^Path = (.+)$/.exec(line)
    if (m?.[1]) paths.push(m[1].replace(/\\/g, '/'))
  }
  return paths
}

function assertServidorOmpsProductContract(unpackedRoot) {
  const productPath = join(unpackedRoot, 'resources', 'servidor-omps-product.json')
  assert.ok(existsSync(productPath), 'resources/servidor-omps-product.json ausente no win-unpacked')
  const product = JSON.parse(readFileSync(productPath, 'utf8'))
  assert.equal(product.schema, 'servidor-omps-product/3')
  assert.equal(product.productLine, 'servidor-omps')
  assert.equal(product.lanAccess?.lanHostMode, 'auto')
  assert.equal(product.lanAccess?.requiredHttpPort, 8080)
  assert.equal(product.lanAccess?.discoveryUdpPort, 47808)
  assert.equal(product.clientDesktopDefaults?.lanDiscovery, true)
  console.log('[inspect] servidor-omps-product.json OK (LAN auto + descoberta UDP)')
}

function main() {
  assertServidorOmpsProductContract(unpackedRoot)
  const fp = collectWinUnpackedFingerprint(unpackedRoot)
  assert.ok(fp.uiMainJs, 'ui-dist/assets/index-*.js ausente em win-unpacked')
  assert.equal(fp.payloadFileCount, 512, 'omps-payload deve ter 512 arquivos')
  assert.ok(fp.payloadContentSha256, 'bundle-meta.json / payloadContentSha256 ausente')
  assert.match(fp.uiMainJs, /^index-.*\.js$/)
  console.log('[inspect] win-unpacked OK', fp)

  const uiMainPath = join(unpackedRoot, 'resources', 'ui-dist', 'assets', fp.uiMainJs)
  const uiJs = readFileSync(uiMainPath, 'utf8')
  assert.ok(uiJs.includes('servidor-omps'))
  assert.ok(
    uiJs.includes('Rede local (LAN)') || uiJs.includes('dashboard-control-lan-access'),
    'UI do dashboard deve incluir faixa LAN (Servidor OMPS)',
  )

  assert.ok(readFileSync(nsisPath), 'Servidor OMPS.exe (NSIS) ausente — rode package:servidor-omps')
  return sha256FileAsync(nsisPath).then(async (nsisSha256) => {
    const entries = listNsisArchiveEntries(nsisPath)
    const hasPayloadDir = entries.some((p) => p.includes('resources/omps-payload/'))
    const hasUiMain = entries.some((p) => p.endsWith(`resources/ui-dist/assets/${fp.uiMainJs}`))
    const hasBundleMeta = entries.some((p) => p.endsWith('resources/omps-bundle/bundle-meta.json'))
    const hasProductJson = entries.some((p) => p.endsWith('resources/servidor-omps-product.json'))
    assert.ok(hasPayloadDir, 'NSIS (7z) não lista resources/omps-payload/')
    assert.ok(hasProductJson, 'NSIS não contém resources/servidor-omps-product.json')
    assert.ok(hasUiMain, `NSIS não contém ui-dist/assets/${fp.uiMainJs}`)
    assert.ok(hasBundleMeta, 'NSIS não contém bundle-meta.json')
    console.log('[inspect] NSIS OK', {
      nsisSha256,
      bytes: readFileSync(nsisPath).length,
      uiMainJs: fp.uiMainJs,
      archiveEntries: entries.length,
    })
  })
}

main().catch((err) => {
  console.error('[inspect] FALHA:', err.message ?? err)
  process.exit(1)
})
