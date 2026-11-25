import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  validateNsisUninstallerArtifact,
  validateNsisUninstallerBuffer,
} from './nsis-uninstaller-artifact.mjs'
import { UninstallerReader } from '../node_modules/app-builder-lib/out/targets/nsis/nsisUtil.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('validateNsisUninstallerBuffer rejeita lixo', () => {
  assert.throws(() => validateNsisUninstallerBuffer(Buffer.from('not pe')), /MZ/)
})

test('artefato audit __uninstaller-audit-* quando presente', async () => {
  const outDir = path.join(root, 'release', 'servidor-omps')
  const audit = fs.existsSync(outDir)
    ? fs.readdirSync(outDir).find((f) => f.startsWith('__uninstaller-audit-') && f.endsWith('.exe'))
    : null
  if (!audit) {
    console.log('[skip audit] rebuild package:servidor-omps para gerar __uninstaller-audit-*')
    return
  }
  const meta = await validateNsisUninstallerArtifact(path.join(outDir, audit))
  assert.ok(meta.totalBytes >= 165_000)
  let readerOk = false
  try {
    await UninstallerReader.exec(path.join(outDir, audit), path.join(outDir, '_reader-probe.exe'))
    readerOk = true
  } catch {
    readerOk = false
  } finally {
    const probe = path.join(outDir, '_reader-probe.exe')
    if (fs.existsSync(probe)) fs.unlinkSync(probe)
  }
  assert.equal(
    readerOk,
    false,
    'desinstalador WriteUninstaller não deve ser formato stub+inner do UninstallerReader',
  )
})
