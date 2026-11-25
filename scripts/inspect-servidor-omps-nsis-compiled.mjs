#!/usr/bin/env node
/**
 * Evidência no artefato NSIS (sem executar instalador): strings e builder-debug.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const nsisPath = path.join(root, 'release', 'servidor-omps', 'Servidor OMPS.exe')
const debugPath = path.join(root, 'release', 'servidor-omps', 'builder-debug.yml')

const NEEDLE_ASCII = [
  'StopServidorOmpsForInstallRoot',
  'customCheckAppRunning',
  'Encerrando Servidor OMPS',
  'Stop-ServidorManager-Installed.ps1',
  'ServidorManager.exe',
  'omps-stop',
]

function utf16LeBuffers(ascii) {
  const buf = Buffer.alloc(ascii.length * 2)
  for (let i = 0; i < ascii.length; i++) {
    buf[i * 2] = ascii.charCodeAt(i)
    buf[i * 2 + 1] = 0
  }
  return buf
}

function findNeedles(haystack, needles) {
  const hits = {}
  for (const n of needles) {
    const a = haystack.includes(n)
    const u = haystack.includes(utf16LeBuffers(n))
    if (a || u) hits[n] = { ascii: a, utf16: u }
  }
  return hits
}

function main() {
  assert.ok(fs.existsSync(nsisPath), `Ausente: ${nsisPath} — rode npm run package:servidor-omps`)
  const pe = fs.readFileSync(nsisPath)
  const hits = findNeedles(pe, NEEDLE_ASCII)
  console.log('[inspect-nsis-compiled] Servidor OMPS.exe', { bytes: pe.length, hits })

  if (fs.existsSync(debugPath)) {
    const dbg = fs.readFileSync(debugPath, 'utf8')
    assert.match(dbg, /installer-servidor-omps\.nsh/)
    assert.match(dbg, /allowOnlyOneInstallerInstance\.nsh/)
    console.log('[inspect-nsis-compiled] builder-debug inclui installer-servidor-omps.nsh')
  } else {
    console.warn('[inspect-nsis-compiled] builder-debug.yml ausente (rebuild recomendado)')
  }

  const missing = NEEDLE_ASCII.filter((n) => !hits[n])
  if (missing.length) {
    console.warn('[inspect-nsis-compiled] strings não encontradas (compressão NSIS/7z):', missing)
  }
}

main()
