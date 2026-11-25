#!/usr/bin/env node
/**
 * Extrai winCodeSign (rcedit/signtool) para vendor/winCodeSign sem exigir symlink em darwin/.
 */
import { existsSync, mkdirSync, chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { path7za } from '7zip-bin'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = path.join(root, 'vendor', 'winCodeSign')
const rcedit = path.join(vendorDir, 'rcedit-x64.exe')
const URL =
  'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z'

export function ensureWinCodeSignVendor() {
  if (existsSync(rcedit)) {
    return vendorDir
  }
  mkdirSync(vendorDir, { recursive: true })
  const archive = path.join(vendorDir, 'winCodeSign-2.6.0.7z')
  if (!existsSync(archive)) {
    const dl = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Invoke-WebRequest -Uri '${URL}' -OutFile '${archive.replace(/'/g, "''")}' -UseBasicParsing`,
      ],
      { encoding: 'utf8', timeout: 120_000 },
    )
    if (dl.status !== 0 || !existsSync(archive)) {
      throw new Error(`Download winCodeSign falhou: ${dl.stderr || dl.stdout}`)
    }
  }
  const r = spawnSync(path7za, ['x', '-y', '-bd', archive, `-o${vendorDir}`], { encoding: 'utf8' })
  if (!existsSync(rcedit)) {
    throw new Error(
      `Falha ao extrair winCodeSign (exit ${r.status}): ${r.stderr || r.stdout}\n` +
        'Ative Modo de Desenvolvedor no Windows (symlinks) ou execute como administrador.',
    )
  }
  return vendorDir
}

if (import.meta.url.startsWith('file:') && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = ensureWinCodeSignVendor()
  console.log('[ensure-wincodesign-vendor] OK', dir)
  try {
    chmodSync(rcedit, 0o755)
  } catch {
    /* windows */
  }
}
