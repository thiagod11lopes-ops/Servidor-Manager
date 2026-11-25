import fs from 'node:fs/promises'
import path from 'node:path'
import { getManagerConfigDir } from '../installation/managerDataRoot.ts'

function getConfigDir(): string {
  return getManagerConfigDir()
}

function getRegistryPath(): string {
  return path.join(getConfigDir(), 'database-numbers.json')
}

export type DatabaseNumberRegistryFile = {
  /** systemId → BNCxx (ordem estável de atribuição) */
  assignments: Record<string, string>
}

export type SystemDatabaseNumberInput = {
  systemId: string
  installedAt: string | null
}

export function formatDatabaseNumber(sequence: number): string {
  if (!Number.isFinite(sequence) || sequence < 1) {
    throw new Error('INVALID_DATABASE_NUMBER_SEQUENCE')
  }
  return `BNC${String(Math.floor(sequence)).padStart(2, '0')}`
}

function parseDatabaseNumber(code: string): number | null {
  const match = /^BNC(\d+)$/i.exec(code.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

function nextFreeSequence(assignments: Record<string, string>): number {
  let max = 0
  for (const code of Object.values(assignments)) {
    const parsed = parseDatabaseNumber(code)
    if (parsed != null && parsed > max) max = parsed
  }
  return max + 1
}

async function readRegistryFile(): Promise<DatabaseNumberRegistryFile> {
  try {
    const raw = await fs.readFile(getRegistryPath(), 'utf8')
    const parsed = JSON.parse(raw) as DatabaseNumberRegistryFile
    if (parsed && typeof parsed.assignments === 'object' && parsed.assignments != null) {
      return { assignments: { ...parsed.assignments } }
    }
  } catch {
    // missing or corrupt — recreate
  }
  return { assignments: {} }
}

async function writeRegistryFile(registry: DatabaseNumberRegistryFile): Promise<void> {
  const configDir = getConfigDir()
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(getRegistryPath(), JSON.stringify(registry, null, 2), 'utf8')
}

function sortSystemsForAssignment(systems: SystemDatabaseNumberInput[]): SystemDatabaseNumberInput[] {
  return [...systems].sort((a, b) => {
    const ta = a.installedAt ?? ''
    const tb = b.installedAt ?? ''
    if (ta !== tb) return ta.localeCompare(tb)
    return a.systemId.localeCompare(b.systemId)
  })
}

/**
 * Atribui códigos BNC01… de forma estável: sistemas já registrados mantêm o código;
 * novos recebem o próximo número livre (lacunas após remoção não são reutilizadas).
 */
export async function syncDatabaseNumberRegistry(
  systems: SystemDatabaseNumberInput[],
): Promise<Record<string, string>> {
  const registry = await readRegistryFile()
  const activeIds = new Set(systems.map((item) => item.systemId))

  for (const systemId of Object.keys(registry.assignments)) {
    if (!activeIds.has(systemId)) {
      delete registry.assignments[systemId]
    }
  }

  const missing = sortSystemsForAssignment(
    systems.filter((item) => registry.assignments[item.systemId] == null),
  )

  for (const item of missing) {
    const sequence = nextFreeSequence(registry.assignments)
    registry.assignments[item.systemId] = formatDatabaseNumber(sequence)
  }

  await writeRegistryFile(registry)
  return { ...registry.assignments }
}

export async function getDatabaseNumberForSystem(systemId: string): Promise<string | null> {
  const registry = await readRegistryFile()
  return registry.assignments[systemId] ?? null
}
