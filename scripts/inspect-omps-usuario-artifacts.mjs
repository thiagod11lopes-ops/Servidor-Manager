#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { path7za } from '7zip-bin'

function listNsisArchiveEntries(nsisFile) {
  const r = spawnSync(path7za, ['l', '-slt', nsisFile], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`7za list falhou: ${r.stderr || r.stdout}`)
  const paths = []
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^Path = (.+)$/.exec(line)
    if (m?.[1]) paths.push(m[1].replace(/\\/g, '/'))
  }
  return paths
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'release', 'omps-usuario')
const unpackedRoot = join(releaseDir, 'win-unpacked')
const nsisPath = join(releaseDir, 'OMPS Usuario.exe')

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function assertProductContract(baseDir) {
  const productPath = join(baseDir, 'resources', 'servidor-omps-product.json')
  assert.ok(existsSync(productPath), 'resources/servidor-omps-product.json ausente')
  const product = JSON.parse(readFileSync(productPath, 'utf8'))
  const lan = product.lanAccess ?? product.fixedLanAccess
  assert.ok(lan, 'lanAccess ausente')
  if (product.lanAccess) {
    assert.equal(product.lanAccess.lanHostMode, 'auto')
    assert.equal(product.lanAccess.requiredHttpPort, 8080)
    assert.equal(product.lanAccess.allowHttpPortFallback, true)
    assert.equal(product.lanAccess.discoveryUdpPort, 47808)
    assert.equal(product.clientDesktopDefaults?.lanDiscovery, true)
  }
  console.log('[inspect-omps-usuario] contrato OK')
}

function assertNoServerPayload(baseDir) {
  const forbidden = [
    join(baseDir, 'resources', 'omps-payload'),
    join(baseDir, 'resources', 'local-service'),
    join(baseDir, 'resources', 'omps-bundle'),
  ]
  for (const p of forbidden) {
    assert.ok(!existsSync(p), `payload de servidor indevido no cliente: ${p}`)
  }
}

function main() {
  assert.ok(existsSync(unpackedRoot), `win-unpacked ausente: ${unpackedRoot}`)
  assert.ok(existsSync(nsisPath), `NSIS ausente: ${nsisPath}`)
  assertProductContract(unpackedRoot)
  assertNoServerPayload(unpackedRoot)
  assert.ok(existsSync(join(unpackedRoot, 'AcompOPMS.exe')), 'AcompOPMS.exe ausente')
  const nsisSha = sha256File(nsisPath)
  const entries = listNsisArchiveEntries(nsisPath)
  assert.ok(
    entries.some((p) => p.replace(/\\/g, '/').endsWith('resources/servidor-omps-product.json')),
    'NSIS não contém servidor-omps-product.json',
  )
  console.log('[inspect-omps-usuario] OK', {
    nsisSha256: nsisSha,
    bytes: statSync(nsisPath).size,
    archiveEntries: entries.length,
  })
}

main()
