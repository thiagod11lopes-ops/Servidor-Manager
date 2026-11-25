#!/usr/bin/env node
/**
 * Monta release/omps-payload e release/omps-bundle/bundle-meta.json para Servidor OMPS.exe.
 *
 * Origem: OMPS_PAYLOAD_SOURCE ou AcompSolemp-cursor-servidor-lan-etapa16-bcc8 (lock).
 * SHA Git: git rev-parse no source se .git existir; senão pin por contentSha256 no lock.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUNDLE_META_SCHEMA,
  DEFAULT_OMPS_SOURCE_RELATIVE,
  LOCK_SCHEMA,
  OMPS_PAYLOAD_EXCLUDE_FILE_NAMES,
  OMPS_PAYLOAD_EXCLUDE_PATH_SEGMENTS,
  OMPS_PAYLOAD_EXCLUDE_TOP_LEVEL,
  OMPS_PAYLOAD_FORBIDDEN_PATHS,
  OMPS_PAYLOAD_INCLUDE_TOP_LEVEL,
  OMPS_PAYLOAD_REQUIRED_PATHS,
} from './omps-payload-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = path.join(root, 'scripts', 'omps-payload-source.lock.json')
const outPayload = path.join(root, 'release', 'omps-payload')
const outBundleDir = path.join(root, 'release', 'omps-bundle')

function usage() {
  console.error(`Uso: node scripts/build-omps-payload.mjs [--write-lock] [--verify-only]`)
  process.exit(1)
}

function parseArgs(argv) {
  let writeLock = false
  let verifyOnly = false
  for (const arg of argv) {
    if (arg === '--write-lock') writeLock = true
    else if (arg === '--verify-only') verifyOnly = true
    else if (arg === '--help' || arg === '-h') usage()
    else usage()
  }
  return { writeLock, verifyOnly }
}

async function readLock() {
  try {
    const raw = await fsp.readFile(lockPath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Lock ausente: ${lockPath}. Rode com --write-lock após confirmar a origem OMPS.`,
      )
    }
    throw error
  }
}

async function persistLockFile(data) {
  await fsp.writeFile(lockPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function resolveSourceDir(lock) {
  const fromEnv = process.env.OMPS_PAYLOAD_SOURCE?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  const rel = lock?.sourceRelativePath?.trim() || DEFAULT_OMPS_SOURCE_RELATIVE
  return path.join(root, rel)
}

async function tryGitSha(sourceDir) {
  const gitDir = path.join(sourceDir, '.git')
  try {
    await fsp.access(gitDir)
  } catch {
    return null
  }
  const { execFileSync } = await import('node:child_process')
  try {
    return execFileSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

async function readOmpsVersion(sourceDir) {
  const pkgPath = path.join(sourceDir, 'frontend', 'package.json')
  const raw = JSON.parse(await fsp.readFile(pkgPath, 'utf8'))
  if (typeof raw.version !== 'string') throw new Error('frontend/package.json sem version')
  return raw.version
}

function normalizeRel(p) {
  return p.split(path.sep).join('/')
}

function shouldExcludeFile(relativePosix, baseName) {
  if (OMPS_PAYLOAD_EXCLUDE_FILE_NAMES.has(baseName)) return true
  if (baseName.startsWith('.env.') && !baseName.endsWith('.example')) return true
  if (baseName.endsWith('.env') && baseName !== '.env.example') return true
  const segments = relativePosix.split('/')
  for (const seg of segments) {
    if (OMPS_PAYLOAD_EXCLUDE_PATH_SEGMENTS.has(seg)) return true
  }
  if (relativePosix.includes('Instalador OPMS')) return true
  return false
}

async function collectPayloadFiles(sourceDir) {
  const files = []
  for (const top of OMPS_PAYLOAD_INCLUDE_TOP_LEVEL) {
    const abs = path.join(sourceDir, top)
    try {
      await fsp.access(abs)
    } catch {
      throw new Error(`Origem OMPS incompleta: falta ${top} em ${sourceDir}`)
    }
    const stat = await fsp.stat(abs)
    if (stat.isFile()) {
      const rel = normalizeRel(top)
      if (!shouldExcludeFile(rel, path.basename(top))) files.push({ abs, rel })
      continue
    }
    async function walk(dir, prefix) {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const ent of entries) {
        const rel = prefix ? `${prefix}/${ent.name}` : ent.name
        const relPosix = normalizeRel(rel)
        if (ent.isDirectory()) {
          if (OMPS_PAYLOAD_EXCLUDE_PATH_SEGMENTS.has(ent.name)) continue
          if (relPosix === 'Instalador OPMS' || relPosix.startsWith('Instalador OPMS/')) continue
          await walk(path.join(dir, ent.name), relPosix)
        } else if (ent.isFile()) {
          if (shouldExcludeFile(relPosix, ent.name)) continue
          files.push({ abs: path.join(dir, ent.name), rel: relPosix })
        }
      }
    }
    await walk(abs, normalizeRel(top))
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel))
  return files
}

async function computeContentSha256(files) {
  const hash = crypto.createHash('sha256')
  for (const { abs, rel } of files) {
    const buf = await fsp.readFile(abs)
    hash.update(rel)
    hash.update('\0')
    hash.update(buf)
  }
  return hash.digest('hex')
}

async function copyPayload(files, destRoot) {
  await fsp.rm(destRoot, { recursive: true, force: true })
  for (const { abs, rel } of files) {
    const dest = path.join(destRoot, ...rel.split('/'))
    await fsp.mkdir(path.dirname(dest), { recursive: true })
    await fsp.copyFile(abs, dest)
  }
}

async function assertPayloadLayout(payloadRoot) {
  for (const rel of OMPS_PAYLOAD_REQUIRED_PATHS) {
    const target = path.join(payloadRoot, ...rel.split('/'))
    try {
      await fsp.access(target)
    } catch {
      throw new Error(`Payload inválido: falta ${rel}`)
    }
  }
  for (const rel of OMPS_PAYLOAD_FORBIDDEN_PATHS) {
    const target = path.join(payloadRoot, ...rel.split('/'))
    try {
      await fsp.access(target)
      throw new Error(`Payload inválido: exclusão esperada presente: ${rel}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Payload inválido')) throw error
    }
  }
}

async function readManagerVersion() {
  const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'))
  return pkg.version ?? '0.0.0'
}

async function writeBundleMeta({
  ompsVersion,
  ompsGitSha,
  contentSha256,
  managerVersion,
  lock,
  sourceRelativePath,
  fileCount,
}) {
  await fsp.mkdir(outBundleDir, { recursive: true })
  const sourceRevision = ompsGitSha
    ? { kind: 'git-sha', value: ompsGitSha, provenance: lock.sourceProvenance ?? 'git-clone' }
    : {
        kind: 'content-sha256',
        value: contentSha256,
        provenance: lock.sourceProvenance ?? 'vendored-workspace-copy',
        sourceRelativePath,
      }
  const meta = {
    schema: BUNDLE_META_SCHEMA,
    productId: 'servidor-omps',
    futureProductLine: 'OMPS.exe',
    futureProductNote:
      'Etapa futura: instalador único OMPS.exe com escolha Servidor ou Cliente; hoje apenas variante Servidor OMPS.',
    displayName: 'AcompOPMS (Servidor)',
    ompsVersion,
    ompsGitSha: ompsGitSha ?? null,
    sourceRevision,
    payloadContentSha256: contentSha256,
    payloadFileCount: fileCount,
    payloadRelativePath: 'omps-payload',
    managerMinVersion: managerVersion,
    builtAt: new Date().toISOString(),
    installHints: {
      requireGit: false,
      requireGitHubUrl: false,
      defaultAccessMode: 'lan',
      overlayDefault: false,
    },
    catalogDefaults: {
      name: 'AcompOPMS',
      technology: 'manifest-lan',
    },
  }
  const metaPath = path.join(outBundleDir, 'bundle-meta.json')
  await fsp.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  return metaPath
}

async function main() {
  const { writeLock, verifyOnly } = parseArgs(process.argv.slice(2))
  const lock = await readLock()
  if (lock.schema !== LOCK_SCHEMA) {
    throw new Error(`Lock schema inesperado: ${lock.schema}`)
  }

  const sourceDir = resolveSourceDir(lock)
  try {
    await fsp.access(sourceDir)
  } catch {
    throw new Error(`Origem OMPS não encontrada: ${sourceDir}`)
  }

  for (const name of OMPS_PAYLOAD_EXCLUDE_TOP_LEVEL) {
    // apenas validação: pastas excluídas não podem ser as únicas fonte
  }

  const files = await collectPayloadFiles(sourceDir)
  const contentSha256 = await computeContentSha256(files)
  const gitSha = (await tryGitSha(sourceDir)) ?? lock.gitSha ?? null
  const ompsVersion = await readOmpsVersion(sourceDir)

  if (lock.contentSha256 && lock.contentSha256 !== contentSha256 && !writeLock) {
    throw new Error(
      `contentSha256 não confere com o lock.\n  lock:   ${lock.contentSha256}\n  atual:  ${contentSha256}\nAtualize o lock com --write-lock se a mudança for intencional.`,
    )
  }

  if (!lock.contentSha256 && !writeLock) {
    throw new Error(
      `Lock sem contentSha256. Rode: node scripts/build-omps-payload.mjs --write-lock`,
    )
  }

  if (lock.gitShaRequired && !gitSha) {
    throw new Error(
      'Lock exige gitSha mas a origem não é um repositório Git. Defina OMPS_PAYLOAD_SOURCE para um clone com .git ou ajuste o lock.',
    )
  }

  if (gitSha && lock.gitSha && lock.gitSha !== gitSha) {
    throw new Error(
      `gitSha no lock (${lock.gitSha}) difere do repositório (${gitSha}). Atualize o lock.`,
    )
  }

  if (writeLock) {
    const nextLock = {
      ...lock,
      schema: LOCK_SCHEMA,
      sourceRelativePath: lock.sourceRelativePath || DEFAULT_OMPS_SOURCE_RELATIVE,
      ompsVersion,
      gitSha: gitSha ?? null,
      gitShaRequired: Boolean(lock.gitShaRequired),
      contentSha256,
      updatedAt: new Date().toISOString(),
    }
    await persistLockFile(nextLock)
    console.log(`[omps-payload] Lock atualizado: ${lockPath}`)
    console.log(`[omps-payload] contentSha256=${contentSha256}`)
    if (gitSha) console.log(`[omps-payload] gitSha=${gitSha}`)
  }

  if (verifyOnly) {
    console.log('[omps-payload] verify-only OK')
    console.log(`  arquivos: ${files.length}`)
    console.log(`  contentSha256: ${contentSha256}`)
    return
  }

  await copyPayload(files, outPayload)
  await assertPayloadLayout(outPayload)
  const managerVersion = await readManagerVersion()
  const metaPath = await writeBundleMeta({
    ompsVersion,
    ompsGitSha: gitSha,
    contentSha256,
    managerVersion,
    lock,
    sourceRelativePath: path.relative(root, sourceDir).replace(/\\/g, '/'),
    fileCount: files.length,
  })

  console.log(`[omps-payload] Payload: ${outPayload} (${files.length} arquivos)`)
  console.log(`[omps-payload] bundle-meta: ${metaPath}`)
  console.log(`[omps-payload] contentSha256=${contentSha256}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
