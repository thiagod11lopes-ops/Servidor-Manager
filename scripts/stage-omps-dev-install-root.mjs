/**
 * Monta release/servidor-omps/win-unpacked/resources para dev localhost
 * (sem Electron/NSIS — só payload + contrato do produto).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const installRoot = path.join(root, 'release', 'servidor-omps', 'win-unpacked')
const resources = path.join(installRoot, 'resources')
const payloadSrc = path.join(root, 'release', 'omps-payload')
const bundleSrc = path.join(root, 'release', 'omps-bundle')
const productSrc = path.join(root, 'resources-packaging', 'servidor-omps-product.json')

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    const stat = fs.statSync(from)
    if (stat.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

if (!fs.existsSync(payloadSrc)) {
  console.error('[stage-omps-dev] Payload ausente. Rode: npm run build:omps-payload')
  process.exit(1)
}

fs.mkdirSync(resources, { recursive: true })

const payloadDest = path.join(resources, 'omps-payload')
if (fs.existsSync(payloadDest)) fs.rmSync(payloadDest, { recursive: true, force: true })
copyDir(payloadSrc, payloadDest)

if (fs.existsSync(bundleSrc)) {
  const bundleDest = path.join(resources, 'omps-bundle')
  if (fs.existsSync(bundleDest)) fs.rmSync(bundleDest, { recursive: true, force: true })
  copyDir(bundleSrc, bundleDest)
}

fs.copyFileSync(productSrc, path.join(resources, 'servidor-omps-product.json'))
console.log('[stage-omps-dev] OK', installRoot)

spawnSync('node', ['scripts/stage-omps-usuario-for-servidor-omps.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})
