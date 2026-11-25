import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BUNDLE_META_SCHEMA,
  BUNDLED_META_FILE,
  OMPS_PAYLOAD_EXCLUDE_FILE_NAMES,
  OMPS_PAYLOAD_EXCLUDE_PATH_SEGMENTS,
  OMPS_PAYLOAD_INCLUDE_TOP_LEVEL,
  OMPS_PAYLOAD_REQUIRED_PATHS,
} from './payloadFileSpec.ts'
import {
  getManagerInstallRoot,
  resolveBundledMetaFilePath,
  resolveBundledPayloadDirectory,
} from './managerInstallRoot.ts'

export type BundledOmpsMeta = {
  schema: string
  productId: string
  ompsVersion: string
  ompsGitSha: string | null
  payloadContentSha256: string
  sourceRevision?: {
    kind: string
    value: string
    provenance?: string
  }
}

function normalizeRel(p: string): string {
  return p.split(path.sep).join('/')
}

function shouldExcludeFile(relativePosix: string, baseName: string): boolean {
  if (OMPS_PAYLOAD_EXCLUDE_FILE_NAMES.has(baseName)) return true
  if (baseName.startsWith('.env.') && !baseName.endsWith('.example')) return true
  if (baseName.endsWith('.env') && baseName !== '.env.example') return true
  for (const seg of relativePosix.split('/')) {
    if (OMPS_PAYLOAD_EXCLUDE_PATH_SEGMENTS.has(seg)) return true
  }
  if (relativePosix.includes('Instalador OPMS')) return true
  return false
}

export async function collectBundledPayloadFiles(payloadRoot: string): Promise<Array<{ abs: string; rel: string }>> {
  const files: Array<{ abs: string; rel: string }> = []
  for (const top of OMPS_PAYLOAD_INCLUDE_TOP_LEVEL) {
    const abs = path.join(payloadRoot, top)
    await fs.access(abs)
    const stat = await fs.stat(abs)
    if (stat.isFile()) {
      const rel = normalizeRel(top)
      if (!shouldExcludeFile(rel, path.basename(top))) files.push({ abs, rel })
      continue
    }
    async function walk(dir: string, prefix: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true })
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

export async function computeBundledPayloadContentSha256(
  payloadRoot: string,
): Promise<{ sha256: string; fileCount: number }> {
  const files = await collectBundledPayloadFiles(payloadRoot)
  const hash = crypto.createHash('sha256')
  for (const { abs, rel } of files) {
    hash.update(rel)
    hash.update('\0')
    hash.update(await fs.readFile(abs))
  }
  return { sha256: hash.digest('hex'), fileCount: files.length }
}

async function readBundleMeta(installRoot: string): Promise<BundledOmpsMeta> {
  const metaPath = resolveBundledMetaFilePath(installRoot)
  const raw = JSON.parse(await fs.readFile(metaPath, 'utf8')) as Record<string, unknown>
  if (raw.schema !== BUNDLE_META_SCHEMA) {
    throw new Error(`bundle-meta schema inválido: ${String(raw.schema)}`)
  }
  if (raw.productId !== 'servidor-omps') {
    throw new Error('bundle-meta productId inesperado.')
  }
  const payloadContentSha256 = String(raw.payloadContentSha256 ?? '').trim()
  if (!/^[a-f0-9]{64}$/.test(payloadContentSha256)) {
    throw new Error('bundle-meta payloadContentSha256 inválido.')
  }
  return {
    schema: BUNDLE_META_SCHEMA,
    productId: 'servidor-omps',
    ompsVersion: String(raw.ompsVersion ?? '0.0.0'),
    ompsGitSha: typeof raw.ompsGitSha === 'string' ? raw.ompsGitSha : null,
    payloadContentSha256,
    sourceRevision:
      raw.sourceRevision && typeof raw.sourceRevision === 'object'
        ? (raw.sourceRevision as BundledOmpsMeta['sourceRevision'])
        : undefined,
  }
}

async function assertRequiredLayout(payloadRoot: string): Promise<void> {
  for (const rel of OMPS_PAYLOAD_REQUIRED_PATHS) {
    await fs.access(path.join(payloadRoot, ...rel.split('/')))
  }
}

export type VerifiedBundledOmpsPayload = {
  installRoot: string
  payloadDirectory: string
  meta: BundledOmpsMeta
  contentSha256: string
  fileCount: number
}

/**
 * Confia no payload somente se estiver em resources/omps-payload do InstallRoot
 * e o hash recalculado bater com bundle-meta.json.
 */
export async function verifyBundledOmpsPayloadAtInstallRoot(
  installRoot: string,
): Promise<{ ok: true; verified: VerifiedBundledOmpsPayload } | { ok: false; reason: string }> {
  const payloadDirectory = resolveBundledPayloadDirectory(installRoot)
  const metaPath = resolveBundledMetaFilePath(installRoot)
  try {
    await fs.access(metaPath)
    await fs.access(payloadDirectory)
  } catch {
    return { ok: false, reason: 'Pacote Servidor OMPS não encontrado nesta instalação do Manager.' }
  }

  const resolvedPayload = path.resolve(payloadDirectory)
  const expectedPayload = path.resolve(resolveBundledPayloadDirectory(installRoot))
  if (resolvedPayload !== expectedPayload) {
    return { ok: false, reason: 'Caminho do payload fora do diretório de instalação.' }
  }

  try {
    await assertRequiredLayout(payloadDirectory)
    const meta = await readBundleMeta(installRoot)
    const { sha256, fileCount } = await computeBundledPayloadContentSha256(payloadDirectory)
    if (sha256 !== meta.payloadContentSha256) {
      return {
        ok: false,
        reason: 'Integridade do payload OMPS não confere com bundle-meta (instalação corrompida ou incompleta).',
      }
    }
    return {
      ok: true,
      verified: {
        installRoot: path.resolve(installRoot),
        payloadDirectory: resolvedPayload,
        meta,
        contentSha256: sha256,
        fileCount,
      },
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: detail }
  }
}

/** Origem local-folder confiável = exatamente o payload verificado do InstallRoot atual. */
export async function isTrustedBundledOmpsPayloadDirectory(
  localFolderPath: string,
): Promise<boolean> {
  const installRoot = getManagerInstallRoot()
  if (!installRoot) return false
  const normalized = path.resolve(localFolderPath.trim())
  const expected = path.resolve(resolveBundledPayloadDirectory(installRoot))
  if (normalized !== expected) return false
  const check = await verifyBundledOmpsPayloadAtInstallRoot(installRoot)
  return check.ok
}
