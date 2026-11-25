#!/usr/bin/env node
/**
 * Metadados PE via rcedit (vendor/winCodeSign) — não depende de winCodeSign cache do electron-builder.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureWinCodeSignVendor } from './ensure-wincodesign-vendor.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const profiles = {
  'omps-usuario': {
    exe: path.join(root, 'release', 'omps-usuario', 'win-unpacked', 'AcompOPMS.exe'),
    companyName: 'Servidor Manager',
    productName: 'OMPS Usuario',
    fileVersion: '1.0.0.0',
  },
  'servidor-omps': {
    exe: path.join(root, 'release', 'servidor-omps', 'win-unpacked', 'ServidorManager.exe'),
    companyName: 'Servidor Manager',
    productName: 'Servidor OMPS',
    fileVersion: '1.1.1.0',
  },
}

const variant = process.argv[2] || 'all'
const selected = variant === 'all' ? Object.keys(profiles) : [variant]
const vendorDir = ensureWinCodeSignVendor()
const rcedit = path.join(vendorDir, 'rcedit-x64.exe')

if (!existsSync(rcedit)) {
  console.error('[apply-omps-exe-metadata] rcedit ausente:', rcedit)
  process.exit(1)
}

for (const key of selected) {
  const p = profiles[key]
  if (!p || !existsSync(p.exe)) {
    console.warn(`[apply-omps-exe-metadata] skip ${key}: exe ausente`)
    continue
  }
  const args = [
    p.exe,
    '--set-version-string',
    'CompanyName',
    p.companyName,
    '--set-version-string',
    'ProductName',
    p.productName,
    '--set-file-version',
    p.fileVersion,
    '--set-product-version',
    p.fileVersion,
  ]
  const r = spawnSync(rcedit, args, { encoding: 'utf8', timeout: 120_000 })
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout)
    process.exit(r.status ?? 1)
  }
  console.log(`[apply-omps-exe-metadata] OK ${p.exe}`)
}
