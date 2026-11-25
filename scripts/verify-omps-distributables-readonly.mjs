#!/usr/bin/env node
/**
 * Verificação de distribuição OMPS (somente leitura):
 * - Pasta final release/omps-unified com os dois NSIS independentes (byte-identical às builds).
 * - Bundle/hub opcionais: subinstaladores sincronizados quando presentes.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { path7za } from '7zip-bin'
import {
  CLIENT_SUBINSTALLER_NSIS_FILENAME,
  CLIENT_SUBINSTALLER_NSIS_REL,
  OMPS_HUB_BUILD_OUTPUT_DIR,
  OMPS_UNIFIED_BUNDLE_DIR,
  OMPS_UNIFIED_DISTRIBUTION_DIR,
  OMPS_UNIFIED_NSIS_EXE_WIN,
  OMPS_USUARIO_BUILD_OUTPUT_DIR,
  SERVER_SUBINSTALLER_NSIS_REL,
  SERVIDOR_OMPS_BUILD_OUTPUT_DIR,
} from './omps-unified-product-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_EXE = 'Servidor OMPS.exe'

function sha256File(filePath) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(filePath))
  return h.digest('hex').toUpperCase()
}

function listNsisArchivePaths(nsisFile) {
  const r = spawnSync(path7za, ['l', '-slt', nsisFile], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  if (r.status !== 0) {
    throw new Error(`7za list falhou (${nsisFile}): ${r.stderr || r.stdout}`)
  }
  const paths = []
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^Path = (.+)$/.exec(line)
    if (m?.[1]) paths.push(m[1].replace(/\\/g, '/'))
  }
  return paths
}

const HUB_SERVER_IN_ARCHIVE = `resources/${SERVER_SUBINSTALLER_NSIS_REL}`.replace(/\\/g, '/')
const HUB_CLIENT_IN_ARCHIVE = `resources/${CLIENT_SUBINSTALLER_NSIS_REL}`.replace(/\\/g, '/')

function extractArchiveMember(archiveFile, memberPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  const r = spawnSync(
    path7za,
    ['e', '-y', `-o${destDir}`, archiveFile, memberPath],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    throw new Error(`7za extract falhou (${memberPath}): ${r.stderr || r.stdout}`)
  }
  const base = path.basename(memberPath)
  const out = path.join(destDir, base)
  assert.ok(fs.existsSync(out), `membro extraído ausente: ${out}`)
  return out
}

function assertNoAuditInArchive(label, nsisFile) {
  const entries = listNsisArchivePaths(nsisFile)
  const bad = entries.filter(
    (p) =>
      p.includes('__uninstaller-audit') ||
      p.includes('__uninstaller-') ||
      /[/\\]nsis-uninstaller-audit[/\\]/i.test(p),
  )
  assert.equal(
    bad.length,
    0,
    `${label}: entradas de auditoria/desinstalador embutidas indevidamente: ${bad.slice(0, 5).join(', ')}`,
  )
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) walkFiles(full, acc)
    else acc.push(full)
  }
  return acc
}

function main() {
  const serverIndependent = path.join(root, SERVIDOR_OMPS_BUILD_OUTPUT_DIR, SERVER_EXE)
  const clientIndependent = path.join(root, OMPS_USUARIO_BUILD_OUTPUT_DIR, CLIENT_SUBINSTALLER_NSIS_FILENAME)
  const serverDist = path.join(root, OMPS_UNIFIED_DISTRIBUTION_DIR, SERVER_EXE)
  const clientDist = path.join(root, OMPS_UNIFIED_DISTRIBUTION_DIR, CLIENT_SUBINSTALLER_NSIS_FILENAME)

  assert.ok(fs.existsSync(serverIndependent), `ausente: ${serverIndependent}`)
  assert.ok(fs.existsSync(clientIndependent), `ausente: ${clientIndependent}`)
  assert.ok(fs.existsSync(serverDist), `distribuição final ausente: ${serverDist}`)
  assert.ok(fs.existsSync(clientDist), `distribuição final ausente: ${clientDist}`)

  const serverHash = sha256File(serverIndependent)
  const clientHash = sha256File(clientIndependent)
  assert.equal(sha256File(serverDist), serverHash, 'Servidor OMPS.exe na pasta final difere do build independente')
  assert.equal(sha256File(clientDist), clientHash, 'OMPS Usuario.exe na pasta final difere do build independente')

  for (const [label, file] of [
    ['Servidor OMPS (independente)', serverIndependent],
    ['OMPS Usuario (independente)', clientIndependent],
    ['Servidor OMPS (distribuição)', serverDist],
    ['OMPS Usuario (distribuição)', clientDist],
  ]) {
    assertNoAuditInArchive(label, file)
  }

  const bundleRoot = path.join(root, OMPS_UNIFIED_BUNDLE_DIR)
  if (fs.existsSync(bundleRoot)) {
    const bundleAudit = walkFiles(bundleRoot).filter((f) => path.basename(f).includes('__uninstaller'))
    assert.equal(bundleAudit.length, 0, `bundle contém __uninstaller: ${bundleAudit.join('; ')}`)
    const bundleServer = path.join(bundleRoot, 'subinstallers', SERVER_SUBINSTALLER_NSIS_REL)
    const bundleClient = path.join(bundleRoot, 'subinstallers', CLIENT_SUBINSTALLER_NSIS_REL)
    if (fs.existsSync(bundleServer)) {
      assert.equal(sha256File(bundleServer), serverHash, 'subinstalador servidor no bundle difere do independente')
    }
    if (fs.existsSync(bundleClient)) {
      assert.equal(sha256File(bundleClient), clientHash, 'subinstalador cliente no bundle difere do independente')
    }
  }

  const hubNsis = path.join(root, OMPS_HUB_BUILD_OUTPUT_DIR, OMPS_UNIFIED_NSIS_EXE_WIN)
  let hubSync = { present: false }
  if (fs.existsSync(hubNsis)) {
    hubSync = { present: true, sha256: sha256File(hubNsis) }
    assertNoAuditInArchive(OMPS_UNIFIED_NSIS_EXE_WIN, hubNsis)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omps-hub-verify-'))
    try {
      const entries = listNsisArchivePaths(hubNsis)
      if (entries.some((p) => p.replace(/\\/g, '/') === HUB_SERVER_IN_ARCHIVE)) {
        const extracted = extractArchiveMember(hubNsis, HUB_SERVER_IN_ARCHIVE, tmp)
        assert.equal(sha256File(extracted), serverHash, 'Servidor OMPS embutido no hub difere do independente')
        hubSync.serverEmbeddedMatchesIndependent = true
      }
      if (entries.some((p) => p.replace(/\\/g, '/') === HUB_CLIENT_IN_ARCHIVE)) {
        const extracted = extractArchiveMember(hubNsis, HUB_CLIENT_IN_ARCHIVE, tmp)
        assert.equal(sha256File(extracted), clientHash, 'OMPS Usuario embutido no hub difere do independente')
        hubSync.clientEmbeddedMatchesIndependent = true
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }

  console.log('[verify-distributables] OK', {
    distributionDir: OMPS_UNIFIED_DISTRIBUTION_DIR,
    serverNsis: { bytes: fs.statSync(serverIndependent).size, sha256: serverHash },
    clientNsis: { bytes: fs.statSync(clientIndependent).size, sha256: clientHash },
    distributionMatchesIndependent: true,
    hub: hubSync,
    auditExcludedFromNsisAndBundle: true,
  })
}

main()
