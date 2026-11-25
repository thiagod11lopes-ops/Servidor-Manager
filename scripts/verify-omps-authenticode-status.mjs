#!/usr/bin/env node
/**
 * Relatório Authenticode dos binários OMPS distribuídos (somente leitura).
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  CLIENT_SUBINSTALLER_NSIS_FILENAME,
  OMPS_UNIFIED_DISTRIBUTION_DIR,
  OMPS_USUARIO_BUILD_OUTPUT_DIR,
  SERVIDOR_OMPS_BUILD_OUTPUT_DIR,
} from './omps-unified-product-spec.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const TARGETS = [
  { id: 'client-unpacked', path: join(root, OMPS_USUARIO_BUILD_OUTPUT_DIR, 'win-unpacked', 'AcompOPMS.exe') },
  { id: 'client-nsis', path: join(root, OMPS_USUARIO_BUILD_OUTPUT_DIR, CLIENT_SUBINSTALLER_NSIS_FILENAME) },
  { id: 'server-unpacked', path: join(root, SERVIDOR_OMPS_BUILD_OUTPUT_DIR, 'win-unpacked', 'ServidorManager.exe') },
  { id: 'server-nsis', path: join(root, SERVIDOR_OMPS_BUILD_OUTPUT_DIR, 'Servidor OMPS.exe') },
  {
    id: 'unified-client-nsis',
    path: join(root, OMPS_UNIFIED_DISTRIBUTION_DIR, CLIENT_SUBINSTALLER_NSIS_FILENAME),
  },
  { id: 'unified-server-nsis', path: join(root, OMPS_UNIFIED_DISTRIBUTION_DIR, 'Servidor OMPS.exe') },
]

function probeAuthenticode(exePath) {
  const psPath = exePath.replace(/'/g, "''")
  const ps = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$s=Get-AuthenticodeSignature -FilePath '${psPath}'; $v=[Diagnostics.FileVersionInfo]::GetVersionInfo('${psPath}'); Write-Output ($s.Status.ToString() + '|' + $v.CompanyName + '|' + $v.ProductName)`,
    ],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true },
  )
  if (ps.status !== 0) {
    return { error: (ps.stderr || ps.stdout || 'powershell failed').trim() }
  }
  const [status, companyName, productName] = (ps.stdout || '').trim().split('|')
  return { status, companyName, productName }
}

const report = []
for (const t of TARGETS) {
  if (!existsSync(t.path)) {
    report.push({ id: t.id, path: t.path, missing: true })
    continue
  }
  report.push({ id: t.id, path: t.path, ...probeAuthenticode(t.path) })
}

console.log(JSON.stringify({ report }, null, 2))

const requireSigned = process.env.SERVIDOR_MANAGER_REQUIRE_SIGNED_EXE === '1'
if (requireSigned) {
  const bad = report.filter((r) => !r.missing && r.status !== 'Valid')
  if (bad.length) {
    console.error('[verify-omps-authenticode] FALHA: assinatura Valid exigida mas ausente:', bad)
    process.exit(1)
  }
}
