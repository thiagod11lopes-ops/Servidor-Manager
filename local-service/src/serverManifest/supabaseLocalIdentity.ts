import fs from 'node:fs/promises'
import path from 'node:path'
import { getSystemRoot, getSystemsRoot } from '../installation/paths.ts'
import { syncSupabaseInternalUrlInServidorEnv } from './syncSupabaseInternalEnv.ts'
import { readSupabaseProjectIdFromRoot } from '../database/tableBrowser/supabaseLocalDbContainer.ts'
import { resolveSystemIdForProjectRoot } from './supabaseStackOwnership.ts'
import { collectUsedSupabaseHostPortsFromDocker } from './supabaseDockerHostPorts.ts'
import { supabaseWorkdirsEqual, readSupabaseStackWorkdir } from './supabaseStackWorkdir.ts'

export type SupabaseLocalIdentityRecord = {
  projectId: string
  apiPort: number
  recordedAt: string
  /** Stack legado com project_id genérico (ex.: workspace) já em produção neste systemId. */
  legacyGenericProjectId?: boolean
}

const GENERIC_PROJECT_IDS = new Set(['workspace', 'default', 'supabase'])

const DEFAULT_PORTS = {
  api: 54321,
  db: 54322,
  shadow: 54320,
  studio: 54323,
  smtp: 54324,
  pooler: 54329,
  analytics: 54327,
} as const

const PORT_BLOCK_STEP = 100

/** Portas host mapeadas juntas ao isolar instalações (54321+N×100, …). */
export const SUPABASE_PORT_BLOCK_SECTIONS: Array<{
  section: string
  base: number
  key?: string
}> = [
  { section: 'api', base: DEFAULT_PORTS.api },
  { section: 'db', base: DEFAULT_PORTS.db },
  { section: 'db', base: DEFAULT_PORTS.shadow, key: 'shadow_port' },
  { section: 'studio', base: DEFAULT_PORTS.studio },
  { section: 'local_smtp', base: DEFAULT_PORTS.smtp },
  { section: 'db.pooler', base: DEFAULT_PORTS.pooler },
  { section: 'analytics', base: DEFAULT_PORTS.analytics },
]

export function supabasePortBlockHostPorts(blockIndex: number): number[] {
  return SUPABASE_PORT_BLOCK_SECTIONS.map(({ base }) => base + blockIndex * PORT_BLOCK_STEP)
}

export function inferSupabasePortBlockIndexFromConfig(content: string): number {
  const api = parseTomlSectionPort(content, 'api')
  if (api === null) return 0
  const block = Math.round((api - DEFAULT_PORTS.api) / PORT_BLOCK_STEP)
  return Number.isFinite(block) && block >= 0 ? block : 0
}

export function configMatchesSupabasePortBlock(content: string, blockIndex: number): boolean {
  for (const entry of SUPABASE_PORT_BLOCK_SECTIONS) {
    const key = entry.key ?? 'port'
    const actual = parseTomlSectionPort(content, entry.section, key)
    if (actual === null) continue
    const expected = entry.base + blockIndex * PORT_BLOCK_STEP
    if (actual !== expected) return false
  }
  return true
}

export function extractHostPortsFromSupabaseConfig(content: string): number[] {
  const ports: number[] = []
  for (const line of normalizeSupabaseConfigText(content).split('\n')) {
    const m = line.trim().match(/^(?:port|shadow_port)\s*=\s*(\d+)/)
    if (m) ports.push(Number.parseInt(m[1], 10))
  }
  return ports
}

/** Normaliza finais de linha antes de editar TOML (upload pelo navegador no Windows costuma gerar CRLF). */
export function normalizeSupabaseConfigText(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function managerSupabaseProjectId(systemId: string): string {
  const hex = systemId.replace(/-/g, '').slice(0, 12)
  return `sm${hex}`
}

export function isGenericSupabaseProjectId(projectId: string): boolean {
  return GENERIC_PROJECT_IDS.has(projectId.trim().toLowerCase())
}

function identityPath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'supabase-local-identity.json')
}

export async function readSupabaseLocalIdentityRecord(
  systemId: string,
): Promise<SupabaseLocalIdentityRecord | null> {
  try {
    const raw = await fs.readFile(identityPath(systemId), 'utf8')
    return JSON.parse(raw) as SupabaseLocalIdentityRecord
  } catch {
    return null
  }
}

async function writeIdentityRecord(systemId: string, record: SupabaseLocalIdentityRecord): Promise<void> {
  await fs.writeFile(identityPath(systemId), JSON.stringify(record, null, 2), 'utf8')
}

export function parseSupabaseApiPortFromConfig(content: string): number {
  return parseTomlSectionPort(content, 'api') ?? DEFAULT_PORTS.api
}

function parseTomlSectionPort(content: string, section: string, key = 'port'): number | null {
  const lines = normalizeSupabaseConfigText(content).split('\n')
  let current = ''
  for (const line of lines) {
    const sec = line.trim().match(/^\[([^\]]+)\]$/)
    if (sec) {
      current = sec[1]
      continue
    }
    if (current !== section) continue
    const m = line.trim().match(new RegExp(`^${key}\\s*=\\s*(\\d+)`))
    if (m) return Number.parseInt(m[1], 10)
  }
  return null
}

export function applySupabasePortBlockToConfig(content: string, blockIndex: number): string {
  if (blockIndex <= 0) return normalizeSupabaseConfigText(content)
  const offset = blockIndex * PORT_BLOCK_STEP
  const replaceSectionPort = (text: string, section: string, base: number, key = 'port') => {
    const target = base + offset
    const lines = normalizeSupabaseConfigText(text).split('\n')
    let current = ''
    let changed = false
    const out = lines.map((line) => {
      const sec = line.trim().match(/^\[([^\]]+)\]$/)
      if (sec) {
        current = sec[1]
        return line
      }
      if (current !== section) return line
      const m = line.trim().match(new RegExp(`^(${key}\\s*=\\s*)(\\d+)(\\s*(?:#.*)?)$`))
      if (!m) return line
      changed = true
      return `${m[1]}${target}${m[3] ?? ''}`
    })
    if (!changed && section === 'db' && key === 'shadow_port') {
      // shadow_port may appear under [db]
    }
    return out.join('\n')
  }

  let next = normalizeSupabaseConfigText(content)
  for (const entry of SUPABASE_PORT_BLOCK_SECTIONS) {
    next = replaceSectionPort(next, entry.section, entry.base, entry.key ?? 'port')
  }
  return next
}

/** OMPS referencia seed.sql no config mas o repositório pode não incluir o arquivo (upload local). */
export async function ensureSupabaseSeedFileIfConfigured(
  rootDirectory: string,
  configContent: string,
): Promise<{ config: string; createdSeed: boolean }> {
  const config = normalizeSupabaseConfigText(configContent)
  if (!/\bseed\.sql\b/.test(config)) {
    return { config, createdSeed: false }
  }
  const seedPath = path.join(rootDirectory, 'supabase', 'seed.sql')
  try {
    await fs.access(seedPath)
    return { config, createdSeed: false }
  } catch {
    await fs.mkdir(path.dirname(seedPath), { recursive: true })
    await fs.writeFile(
      seedPath,
      '-- Servidor Manager: placeholder — projeto sem seed.sql no pacote.\n',
      'utf8',
    )
    return { config, createdSeed: true }
  }
}

async function finalizeSupabaseConfigForInstall(
  rootDirectory: string,
  configContent: string,
): Promise<string> {
  const seed = await ensureSupabaseSeedFileIfConfigured(rootDirectory, configContent)
  return seed.config
}

export function setSupabaseProjectIdInConfig(content: string, projectId: string): string {
  const normalized = normalizeSupabaseConfigText(content)
  if (/^\s*project_id\s*=/m.test(normalized)) {
    return normalized.replace(/^\s*project_id\s*=\s*"[^"]*"/m, `project_id = "${projectId}"`)
  }
  return `project_id = "${projectId}"\n\n${normalized}`
}

export async function collectUsedSupabaseHostPorts(excludeSystemId?: string): Promise<Set<number>> {
  const used = new Set<number>()
  const root = path.resolve(getSystemsRoot())
  let entries: string[] = []
  try {
    entries = await fs.readdir(root)
  } catch {
    return used
  }
  for (const entry of entries) {
    if (excludeSystemId && entry === excludeSystemId) continue
    const identityFile = path.join(root, entry, 'supabase-local-identity.json')
    try {
      const record = JSON.parse(await fs.readFile(identityFile, 'utf8')) as SupabaseLocalIdentityRecord
      if (record.apiPort) used.add(record.apiPort)
    } catch {
      // ignore
    }
    const configPath = path.join(root, entry, 'project', 'supabase', 'config.toml')
    try {
      const raw = await fs.readFile(configPath, 'utf8')
      for (const port of extractHostPortsFromSupabaseConfig(raw)) {
        used.add(port)
      }
    } catch {
      // ignore
    }
  }

  try {
    const fromDocker = await collectUsedSupabaseHostPortsFromDocker()
    for (const port of fromDocker) used.add(port)
  } catch {
    // Docker indisponível — mantém apenas inventário em disco
  }

  return used
}

/** @deprecated Prefer collectUsedSupabaseHostPorts */
export async function collectUsedSupabaseApiPorts(excludeSystemId?: string): Promise<Set<number>> {
  return collectUsedSupabaseHostPorts(excludeSystemId)
}

export function pickSupabasePortBlockIndex(usedHostPorts: Set<number>): number | null {
  for (let block = 0; block < 40; block += 1) {
    const blockPorts = supabasePortBlockHostPorts(block)
    if (blockPorts.every((port) => !usedHostPorts.has(port))) return block
  }
  return null
}

/** Bloco padrão (54321, 54322, …) indisponível se qualquer porta da faixa já estiver reservada. */
export function supabaseDefaultPortBlockIsTaken(usedHostPorts: Set<number>): boolean {
  return supabasePortBlockHostPorts(0).some((port) => usedHostPorts.has(port))
}

export type EnsureSupabaseLocalIdentityResult =
  | { ok: true; message: string; projectId: string; apiPort: number; changed: boolean }
  | { ok: false; message: string }

/**
 * Garante project_id único por systemId Manager (novas instalações) sem migrar stacks legados em uso.
 */
export async function ensureManagerSupabaseLocalIdentity(input: {
  systemId: string
  rootDirectory: string
}): Promise<EnsureSupabaseLocalIdentityResult> {
  const configPath = path.join(input.rootDirectory, 'supabase', 'config.toml')
  let configRaw: string
  try {
    configRaw = await fs.readFile(configPath, 'utf8')
  } catch {
    return { ok: false, message: `supabase/config.toml não encontrado em ${input.rootDirectory}` }
  }

  const existingRecord = await readSupabaseLocalIdentityRecord(input.systemId)
  const currentProjectId = readSupabaseProjectIdFromRoot(input.rootDirectory) ?? 'workspace'
  const stackWorkdir = await readSupabaseStackWorkdir(input.rootDirectory)
  const resolvedRoot = path.resolve(input.rootDirectory)

  if (existingRecord) {
    if (
      existingRecord.legacyGenericProjectId &&
      !isGenericSupabaseProjectId(currentProjectId) &&
      currentProjectId !== existingRecord.projectId
    ) {
      return {
        ok: false,
        message:
          'Identidade legada registrada (project_id genérico), mas supabase/config.toml foi alterado manualmente. Restaure o project_id registrado ou consulte os logs de instalação.',
      }
    }
    let nextConfig = configRaw
    let changed = false
    if (currentProjectId !== existingRecord.projectId) {
      nextConfig = setSupabaseProjectIdInConfig(nextConfig, existingRecord.projectId)
      changed = true
    }
    const apiInConfig = parseSupabaseApiPortFromConfig(nextConfig)
    const blockFromRecord = Math.max(
      0,
      Math.round((existingRecord.apiPort - DEFAULT_PORTS.api) / PORT_BLOCK_STEP),
    )
    const effectiveBlock = blockFromRecord
    if (
      !configMatchesSupabasePortBlock(nextConfig, effectiveBlock) ||
      apiInConfig !== existingRecord.apiPort
    ) {
      nextConfig = applySupabasePortBlockToConfig(
        setSupabaseProjectIdInConfig(configRaw, existingRecord.projectId),
        effectiveBlock,
      )
      changed = true
    }
    const seedEnsure = await ensureSupabaseSeedFileIfConfigured(input.rootDirectory, nextConfig)
    if (seedEnsure.createdSeed) changed = true
    if (changed) {
      nextConfig = seedEnsure.config
      await fs.writeFile(configPath, nextConfig, 'utf8')
    }
    await syncSupabaseInternalUrlInServidorEnv(input.rootDirectory, existingRecord.apiPort)
    return {
      ok: true,
      message: 'Identidade Supabase local já registrada para este sistema.',
      projectId: existingRecord.projectId,
      apiPort: existingRecord.apiPort,
      changed,
    }
  }

  if (
    stackWorkdir &&
    supabaseWorkdirsEqual(stackWorkdir, resolvedRoot) &&
    isGenericSupabaseProjectId(currentProjectId)
  ) {
    const ownerSystemId = await resolveSystemIdForProjectRoot(resolvedRoot)
    if (ownerSystemId && ownerSystemId !== input.systemId) {
      return {
        ok: false,
        message:
          'Stack Supabase no Docker está associada a outro systemId Manager neste host. Não foi aplicado marcador legado para evitar conflito de propriedade.',
      }
    }
    const apiPort = parseSupabaseApiPortFromConfig(configRaw)
    const record: SupabaseLocalIdentityRecord = {
      projectId: currentProjectId,
      apiPort,
      recordedAt: new Date().toISOString(),
      legacyGenericProjectId: true,
    }
    await writeIdentityRecord(input.systemId, record)
    await syncSupabaseInternalUrlInServidorEnv(input.rootDirectory, apiPort)
    return {
      ok: true,
      message: 'Stack legado (project_id genérico) preservado para esta instalação.',
      projectId: currentProjectId,
      apiPort,
      changed: false,
    }
  }

  let nextProjectId = currentProjectId
  let portBlockIndex = 0
  let nextConfig = configRaw

  const expectedDedicatedId = managerSupabaseProjectId(input.systemId)
  if (
    !isGenericSupabaseProjectId(currentProjectId) &&
    currentProjectId !== expectedDedicatedId
  ) {
    return {
      ok: false,
      message: `project_id "${currentProjectId}" em supabase/config.toml não corresponde a este systemId (esperado "${expectedDedicatedId}" ou genérico legado).`,
    }
  }

  if (isGenericSupabaseProjectId(currentProjectId)) {
    nextProjectId = expectedDedicatedId
    const usedPorts = await collectUsedSupabaseHostPorts(input.systemId)
    const picked = pickSupabasePortBlockIndex(usedPorts)
    if (picked === null) {
      return {
        ok: false,
        message:
          'Não há faixa de portas Supabase local livre (54321+N×100). Encerre outra instalação OMPS ou libere portas antes de continuar.',
      }
    }
    portBlockIndex = picked
    nextConfig = setSupabaseProjectIdInConfig(configRaw, nextProjectId)
    nextConfig = applySupabasePortBlockToConfig(nextConfig, portBlockIndex)
  }

  const apiPort =
    parseTomlSectionPort(nextConfig, 'api') ??
    DEFAULT_PORTS.api + portBlockIndex * PORT_BLOCK_STEP

  nextConfig = await finalizeSupabaseConfigForInstall(input.rootDirectory, nextConfig)
  await fs.writeFile(configPath, nextConfig, 'utf8')
  const record: SupabaseLocalIdentityRecord = {
    projectId: nextProjectId,
    apiPort,
    recordedAt: new Date().toISOString(),
  }
  await writeIdentityRecord(input.systemId, record)
  await syncSupabaseInternalUrlInServidorEnv(input.rootDirectory, apiPort)

  const changed = nextProjectId !== currentProjectId || portBlockIndex > 0
  return {
    ok: true,
    message: changed
      ? `Supabase local isolado: project_id=${nextProjectId}, API 127.0.0.1:${apiPort}.`
      : 'Identidade Supabase registrada.',
    projectId: nextProjectId,
    apiPort,
    changed,
  }
}
