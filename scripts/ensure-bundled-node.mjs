/**
 * Baixa Node.js LTS oficial (win-x64), verifica SHA-256 (SHASUMS256.txt) e registra Authenticode.
 * Saída: vendor/bundled-node/win-x64/ (gitignored) para extraResources do electron-builder.
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const specPath = path.join(root, 'scripts', 'manager-bundled-node-version.json')
const outDir = path.join(root, 'vendor', 'bundled-node', 'win-x64')

const spec = JSON.parse(await fs.readFile(specPath, 'utf8'))
const version = spec.version
const zipName = spec.artifactNameTemplate.replace('{version}', version)
const distUrl = `${spec.distBaseUrl}/v${version}/${zipName}`
const shasumsUrl = `${spec.distBaseUrl}/v${version}/SHASUMS256.txt`

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Download falhou (${res.status}): ${url}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function parseExpectedHash(shasumsText, fileName) {
  for (const line of shasumsText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = /^([a-f0-9]{64})\s+(.+)$/.exec(trimmed)
    if (!match) continue
    const [, hash, name] = match
    const bare = name.replace(/^\*+/, '').trim()
    if (bare === fileName || name.includes(fileName)) {
      return hash.toLowerCase()
    }
  }
  return null
}

function verifyAuthenticode(nodeExePath) {
  const ps = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$s = Get-AuthenticodeSignature -LiteralPath '${nodeExePath.replace(/'/g, "''")}'; [PSCustomObject]@{ Status = [string]$s.Status; SignerCertificate = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { $null } } | ConvertTo-Json -Compress`,
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  if (ps.status !== 0) {
    return { ok: false, error: ps.stderr || ps.stdout || 'Get-AuthenticodeSignature falhou' }
  }
  try {
    return { ok: true, ...JSON.parse(ps.stdout.trim()) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function extractNodeExe(zipBuffer) {
  const { execFileSync } = await import('node:child_process')
  const tmpZip = path.join(outDir, '..', '_download.zip')
  await fs.mkdir(path.dirname(tmpZip), { recursive: true })
  await fs.writeFile(tmpZip, zipBuffer)
  const extractDir = path.join(outDir, '..', '_extract')
  await fs.rm(extractDir, { recursive: true, force: true })
  await fs.mkdir(extractDir, { recursive: true })
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${tmpZip.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: 'inherit', windowsHide: true },
  )
  const folderName = zipName.replace(/\.zip$/i, '')
  const nodeExe = path.join(extractDir, folderName, 'node.exe')
  await fs.access(nodeExe)
  await fs.mkdir(outDir, { recursive: true })
  await fs.copyFile(nodeExe, path.join(outDir, 'node.exe'))
  const licenseSrc = path.join(extractDir, folderName, 'LICENSE')
  try {
    await fs.copyFile(licenseSrc, path.join(outDir, 'LICENSE'))
  } catch {
    // optional
  }
  await fs.rm(extractDir, { recursive: true, force: true })
  await fs.rm(tmpZip, { force: true })
}

const nodeExePath = path.join(outDir, 'node.exe')
const manifestPath = path.join(outDir, 'manifest.json')

try {
  await fs.access(nodeExePath)
  const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  if (existing.version === version && existing.sha256Verified) {
    console.log(`ensure-bundled-node: node.exe v${version} já presente (${nodeExePath})`)
    process.exit(0)
  }
} catch {
  // download fresh
}

console.log(`ensure-bundled-node: baixando ${distUrl}`)
const zipBuffer = await download(distUrl)
console.log(`ensure-bundled-node: baixando ${shasumsUrl}`)
const shasumsText = (await download(shasumsUrl)).toString('utf8')
const expectedHash = parseExpectedHash(shasumsText, zipName)
if (!expectedHash) {
  throw new Error(`Hash SHA-256 não encontrado em SHASUMS256.txt para ${zipName}`)
}
const actualHash = sha256Hex(zipBuffer)
if (actualHash !== expectedHash) {
  throw new Error(
    `SHA-256 do zip não confere.\nEsperado: ${expectedHash}\nObtido:  ${actualHash}`,
  )
}
console.log(`ensure-bundled-node: SHA-256 OK (${actualHash})`)

await extractNodeExe(zipBuffer)

const auth = verifyAuthenticode(nodeExePath)
const nodeHash = sha256Hex(await fs.readFile(nodeExePath))

const manifest = {
  version,
  sourceUrl: distUrl,
  shasumsUrl,
  zipSha256: actualHash,
  nodeExeSha256: nodeHash,
  sha256Verified: true,
  downloadedAt: new Date().toISOString(),
  authenticode: auth,
}
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

console.log(`ensure-bundled-node: node.exe em ${nodeExePath}`)
console.log(`ensure-bundled-node: Authenticode Status=${auth.Status ?? auth.error ?? 'unknown'}`)
if (auth.SignerCertificate) {
  console.log(`ensure-bundled-node: Signer=${auth.SignerCertificate}`)
}
