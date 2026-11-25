import fs from 'node:fs/promises'
import path from 'node:path'
import { getSystemsRoot } from '../installation/paths.ts'
import { supabaseWorkdirsEqual } from './supabaseStackWorkdir.ts'

/** Estados em que outro systemId não deve sofrer supabase stop/reconcile involuntário. */
const ACTIVE_STATUSES = new Set(['installed-lan', 'phases-through-build-ok'])

export async function resolveSystemIdForProjectRoot(projectRoot: string): Promise<string | null> {
  const normalized = path.resolve(projectRoot)
  let entries: string[] = []
  try {
    entries = await fs.readdir(getSystemsRoot())
  } catch {
    return null
  }

  for (const entry of entries) {
    const candidate = path.join(getSystemsRoot(), entry, 'project')
    if (supabaseWorkdirsEqual(candidate, normalized)) {
      return entry
    }
  }
  return null
}

export async function readSystemManifestStatus(systemId: string): Promise<string | null> {
  const statePath = path.join(getSystemsRoot(), systemId, 'server-manifest-state.json')
  try {
    const raw = JSON.parse(await fs.readFile(statePath, 'utf8')) as { status?: string }
    return raw.status ?? null
  } catch {
    return null
  }
}

export async function isActiveManagedSystem(systemId: string): Promise<boolean> {
  const status = await readSystemManifestStatus(systemId)
  return status !== null && ACTIVE_STATUSES.has(status)
}

export type ForeignStackConflict = {
  foreignSystemId: string
  foreignProjectRoot: string
  foreignStatus: string | null
}

/** Outro systemId Manager ativo usando o stack Docker registrado neste workdir. */
export async function detectForeignActiveStackOwner(input: {
  currentSystemId: string
  registeredWorkdir: string
}): Promise<ForeignStackConflict | null> {
  const foreignSystemId = await resolveSystemIdForProjectRoot(input.registeredWorkdir)
  if (!foreignSystemId || foreignSystemId === input.currentSystemId) return null
  const foreignStatus = await readSystemManifestStatus(foreignSystemId)
  if (!foreignStatus || !ACTIVE_STATUSES.has(foreignStatus)) return null
  return {
    foreignSystemId,
    foreignProjectRoot: input.registeredWorkdir,
    foreignStatus,
  }
}
