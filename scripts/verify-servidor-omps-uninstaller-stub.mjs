#!/usr/bin/env node
/**
 * Após electron-builder: valida __uninstaller-audit-* (cópia pré-embed) ou stub __uninstaller-*,
 * ou confirma que UninstallerReader NÃO consegue ler o instalador 7z final (esperado).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { UninstallerReader } from '../node_modules/app-builder-lib/out/targets/nsis/nsisUtil.js'
import { validateNsisUninstallerArtifact } from './nsis-uninstaller-artifact.mjs'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const outDir = join(root, 'release', 'servidor-omps')
const installer = join(outDir, 'Servidor OMPS.exe')

function findUninstallerArtifact() {
  if (!fs.existsSync(outDir)) return null
  const names = fs.readdirSync(outDir)
  const auditDir = join(outDir, 'nsis-uninstaller-audit')
  const auditInSubdirName = fs.existsSync(auditDir)
    ? (fs.readdirSync(auditDir).find((f) => f.startsWith('__uninstaller-audit-') && f.endsWith('.exe')) ??
      null)
    : null
  if (auditInSubdirName) {
    return { kind: 'audit', name: auditInSubdirName, path: join(auditDir, auditInSubdirName) }
  }
  const auditRoot = names.find((f) => f.startsWith('__uninstaller-audit-') && f.endsWith('.exe')) ?? null
  if (auditRoot) return { kind: 'audit', name: auditRoot, path: join(outDir, auditRoot) }
  const stub = names.find((f) => f.startsWith('__uninstaller-') && f.endsWith('.exe')) ?? null
  if (stub) return { kind: 'stub', name: stub, path: join(outDir, stub) }
  return null
}

async function main() {
  assert.ok(fs.existsSync(installer), 'Servidor OMPS.exe ausente')
  const found = findUninstallerArtifact()
  if (found) {
    const artifactPath = found.path
    const meta = await validateNsisUninstallerArtifact(artifactPath)
    console.log('[verify-uninstaller] artefato NSIS OK', { ...found, ...meta })
    return
  }

  let readerFailed = false
  try {
    await UninstallerReader.exec(installer, join(outDir, '_should-not-create.exe'))
  } catch (e) {
    readerFailed = true
    console.log('[verify-uninstaller] UninstallerReader no instalador 7z falhou como esperado:', e.message)
  }
  assert.ok(readerFailed, 'instalador final não deve ser legível pelo UninstallerReader legado')
  console.warn(
    '[verify-uninstaller] AVISO: __uninstaller-audit-* ausente — rode package:servidor-omps após patch NSIS para validação completa do desinstalador.',
  )
}

main().catch((err) => {
  console.error('[verify-uninstaller] FALHA:', err.message ?? err)
  process.exit(1)
})
