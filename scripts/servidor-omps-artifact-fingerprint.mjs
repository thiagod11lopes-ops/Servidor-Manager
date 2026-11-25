import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export function findUiMainJsBasename(uiDistDir) {
  if (!existsSync(uiDistDir)) return null
  const assets = join(uiDistDir, 'assets')
  if (!existsSync(assets)) return null
  const match = readdirSync(assets).find((f) => /^index-.*\.js$/i.test(f))
  return match ?? null
}

export function sha256FileSync(filePath) {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

export function sha256FileAsync(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function bufferContainsAscii(buffer, text) {
  return buffer.includes(Buffer.from(text, 'utf8'))
}

export function collectWinUnpackedFingerprint(unpackedRoot) {
  const resources = join(unpackedRoot, 'resources')
  const uiDist = join(resources, 'ui-dist')
  const uiMainJs = findUiMainJsBasename(uiDist)
  const metaPath = join(resources, 'omps-bundle', 'bundle-meta.json')
  const payloadRoot = join(resources, 'omps-payload')
  let meta = null
  if (existsSync(metaPath)) {
    meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  }
  let payloadFileCount = 0
  if (existsSync(payloadRoot)) {
    payloadFileCount = countFilesRecursive(payloadRoot)
  }
  const uiMainPath = uiMainJs ? join(uiDist, 'assets', uiMainJs) : null
  return {
    uiMainJs,
    uiMainSha256: uiMainPath ? sha256FileSync(uiMainPath) : null,
    payloadFileCount,
    payloadContentSha256: meta?.payloadContentSha256 ?? null,
    bundleMetaBuiltAt: meta?.builtAt ?? null,
    managerMinVersion: meta?.managerMinVersion ?? null,
  }
}

function countFilesRecursive(dir) {
  let n = 0
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) n += countFilesRecursive(p)
    else n += 1
  }
  return n
}
