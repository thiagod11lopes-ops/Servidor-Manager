#!/usr/bin/env node
/**
 * Confere scripts de atalho embutidos no win-unpacked e no NSIS (7z), sem instalar.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { path7za } from '7zip-bin'
import {
  OMPS_UNIFIED_DISTRIBUTION_DIR,
  OMPS_USUARIO_BUILD_OUTPUT_DIR,
  SERVIDOR_OMPS_BUILD_OUTPUT_DIR,
} from './omps-unified-product-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const SERVER_POST = 'resources/server-bootstrap/PostInstall-ServidorOmpsShortcuts.ps1'
const SERVER_CREATE = 'resources/server-bootstrap/Create-DesktopShortcut-Manager.ps1'
const CLIENT_POST = 'resources/omps-usuario-bootstrap/PostInstall-OmpsUsuario.ps1'
const CLIENT_CREATE = 'resources/omps-usuario-bootstrap/Create-DesktopShortcut-OmpsUsuario.ps1'

function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function assertShortcutScriptContract(label, text) {
  assert.doesNotMatch(
    text,
    /[\u2014\u2013].*"/,
    `${label}: em/en dash em string quebra parser CP1252 do powershell -File`,
  )
  if (label.includes('PostInstall')) {
    assert.match(text, /Test-OmpsTruthyInstallFlag/, `${label}: flag NSIS 0/1`)
    assert.match(text, /\[string\]\s*\$CreateDesktopShortcut/, `${label}: param string CreateDesktopShortcut`)
    assert.match(
      text,
      /& \$shortcutScript -InstallRoot \$InstallRoot -CreateDesktopShortcut \$true/,
      `${label}: repassa bool true ao filho`,
    )
    assert.match(
      text,
      /& \$shortcutScript -InstallRoot \$InstallRoot -CreateDesktopShortcut \$false/,
      `${label}: repassa bool false ao filho`,
    )
  }
  if (label.includes('Create-DesktopShortcut')) {
    assert.match(text, /\[bool\]\s*\$CreateDesktopShortcut/, `${label}: param bool no filho`)
    assert.match(text, /if \(-not \$CreateDesktopShortcut\)/, `${label}: omitir atalho quando false`)
  }
}

function extractNsisMember(nsisFile, memberPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  const memberWin = memberPath.replace(/\//g, '\\')
  const r = spawnSync(path7za, ['e', '-y', `-o${destDir}`, nsisFile, memberWin], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (r.status !== 0) {
    throw new Error(`7za extract falhou (${memberPath}): ${r.stderr || r.stdout}`)
  }
  const out = path.join(destDir, path.basename(memberPath))
  assert.ok(fs.existsSync(out), `membro extraído ausente: ${out}`)
  return out
}

function assertWinUnpackedMatchesNsis(productLabel, unpackedRoot, nsisPath, members) {
  for (const rel of members) {
    const unpackedPath = path.join(unpackedRoot, ...rel.split('/'))
    assert.ok(fs.existsSync(unpackedPath), `${productLabel} win-unpacked ausente: ${rel}`)
    const unpackedText = readUtf8(unpackedPath)
    assertShortcutScriptContract(`${productLabel} ${path.basename(rel)}`, unpackedText)

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omps-shortcut-nsis-'))
    try {
      const extracted = extractNsisMember(nsisPath, rel, tmp)
      const nsisText = readUtf8(extracted)
      assert.equal(
        sha256Text(nsisText),
        sha256Text(unpackedText),
        `${productLabel} NSIS difere do win-unpacked: ${rel}`,
      )
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }
}

function main() {
  const serverUnpacked = path.join(root, SERVIDOR_OMPS_BUILD_OUTPUT_DIR, 'win-unpacked')
  const clientUnpacked = path.join(root, OMPS_USUARIO_BUILD_OUTPUT_DIR, 'win-unpacked')
  const serverNsis = path.join(root, SERVIDOR_OMPS_BUILD_OUTPUT_DIR, 'Servidor OMPS.exe')
  const clientNsis = path.join(root, OMPS_USUARIO_BUILD_OUTPUT_DIR, 'OMPS Usuario.exe')
  const unifiedServer = path.join(root, OMPS_UNIFIED_DISTRIBUTION_DIR, 'Servidor OMPS.exe')
  const unifiedClient = path.join(root, OMPS_UNIFIED_DISTRIBUTION_DIR, 'OMPS Usuario.exe')

  assert.ok(fs.existsSync(serverNsis), 'Servidor OMPS.exe ausente — rode package:servidor-omps')
  assert.ok(fs.existsSync(clientNsis), 'OMPS Usuario.exe ausente — rode package:omps-usuario')

  assertWinUnpackedMatchesNsis('Servidor', serverUnpacked, serverNsis, [SERVER_POST, SERVER_CREATE])
  assertWinUnpackedMatchesNsis('Usuario', clientUnpacked, clientNsis, [CLIENT_POST, CLIENT_CREATE])

  for (const nshRel of ['desktop/installer-servidor-omps.nsh', 'desktop/installer-omps-usuario.nsh']) {
    const nsh = readUtf8(path.join(root, nshRel))
    assert.match(nsh, /CreateDesktopShortcut 0/, `${nshRel}: NSIS deve passar flag 0`)
    assert.match(nsh, /CreateDesktopShortcut 1/, `${nshRel}: NSIS deve passar flag 1`)
  }

  if (fs.existsSync(unifiedServer) && fs.existsSync(unifiedClient)) {
    const serverHash = sha256Text(fs.readFileSync(serverNsis))
    const unifiedServerHash = sha256Text(fs.readFileSync(unifiedServer))
    assert.equal(unifiedServerHash, serverHash, 'omps-unified/Servidor OMPS.exe difere de release/servidor-omps')
    const clientHash = sha256Text(fs.readFileSync(clientNsis))
    const unifiedClientHash = sha256Text(fs.readFileSync(unifiedClient))
    assert.equal(unifiedClientHash, clientHash, 'omps-unified/OMPS Usuario.exe difere de release/omps-usuario')
  }

  console.log('[verify-shortcut-bootstrap] OK — win-unpacked = NSIS (7z) para scripts de atalho')
}

main()
