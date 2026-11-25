import path from 'node:path'
import { readSupabaseProjectIdFromRoot } from '../database/tableBrowser/supabaseLocalDbContainer.ts'
import { managerSupabaseProjectId, readSupabaseLocalIdentityRecord } from './supabaseLocalIdentity.ts'
import type { ForeignStackConflict } from './supabaseStackOwnership.ts'
import { readSupabaseStackDockerMetadata, supabaseWorkdirsEqual } from './supabaseStackWorkdir.ts'

export type StackProvenanceVerdict =
  | { ok: true; running: boolean; projectId: string }
  | { ok: false; reason: string; label: string }

/** Avaliação pura (testável) da propriedade da stack. */
export function evaluateSupabaseStackProvenance(input: {
  systemId: string
  rootDirectory: string
  configProjectId: string
  identityProjectId: string | null
  identityLegacyGeneric: boolean
  dockerWorkdir: string | null
  dockerCliProject: string | null
  ownerSystemId: string | null
  foreignActive: ForeignStackConflict | null
}): StackProvenanceVerdict {
  const resolvedRoot = path.resolve(input.rootDirectory)
  const expectedDedicatedId = managerSupabaseProjectId(input.systemId)

  if (input.identityProjectId && input.configProjectId !== input.identityProjectId) {
    return {
      ok: false,
      label: 'supabase identity',
      reason: `supabase/config.toml (project_id=${input.configProjectId}) difere do registrado para este systemId (${input.identityProjectId}).`,
    }
  }

  const effectiveProjectId = input.identityProjectId ?? input.configProjectId

  if (
    !input.identityLegacyGeneric &&
    input.identityProjectId &&
    input.identityProjectId !== expectedDedicatedId &&
    !input.identityProjectId.startsWith('sm')
  ) {
    // legado genérico permitido; ids sm* dedicados devem bater com o systemId
  }

  if (
    input.identityProjectId &&
    input.identityProjectId.startsWith('sm') &&
    input.identityProjectId !== expectedDedicatedId &&
    !input.identityLegacyGeneric
  ) {
    return {
      ok: false,
      label: 'supabase identity',
      reason: `project_id registrado (${input.identityProjectId}) não corresponde a este systemId (esperado ${expectedDedicatedId}).`,
    }
  }

  if (input.foreignActive) {
    return {
      ok: false,
      label: 'supabase concurrency',
      reason: [
        'Stack Supabase pertence a outra instalação ativa do Manager.',
        `Sistema: ${input.foreignActive.foreignSystemId} (${input.foreignActive.foreignStatus ?? 'ativo'})`,
        `Workdir Docker: ${input.foreignActive.foreignProjectRoot}`,
      ].join('\n'),
    }
  }

  if (input.ownerSystemId && input.ownerSystemId !== input.systemId) {
    return {
      ok: false,
      label: 'supabase ownership',
      reason: `Workdir Docker registrado para o systemId ${input.ownerSystemId}, não para ${input.systemId}.`,
    }
  }

  if (input.dockerWorkdir) {
    if (!supabaseWorkdirsEqual(input.dockerWorkdir, resolvedRoot)) {
      return {
        ok: false,
        label: 'supabase workdir',
        reason: [
          'Stack Docker encontrada, mas o workdir não corresponde a este clone.',
          `Workdir Docker: ${input.dockerWorkdir}`,
          `Clone deste sistema: ${resolvedRoot}`,
          `project_id em config: ${effectiveProjectId}`,
        ].join('\n'),
      }
    }
    if (input.dockerCliProject && input.dockerCliProject !== effectiveProjectId) {
      return {
        ok: false,
        label: 'supabase project',
        reason: `Container Docker reporta project_id=${input.dockerCliProject}, esperado ${effectiveProjectId}.`,
      }
    }
    return { ok: true, running: true, projectId: effectiveProjectId }
  }

  return { ok: true, running: false, projectId: effectiveProjectId }
}

export async function verifySupabaseStackProvenanceForMutation(input: {
  systemId: string
  rootDirectory: string
  ownerSystemId: string | null
  foreignActive: ForeignStackConflict | null
}): Promise<StackProvenanceVerdict> {
  const configProjectId = readSupabaseProjectIdFromRoot(input.rootDirectory)
  if (!configProjectId) {
    return {
      ok: false,
      label: 'supabase config',
      reason: 'project_id ausente em supabase/config.toml.',
    }
  }

  const identity = await readSupabaseLocalIdentityRecord(input.systemId)
  const meta = await readSupabaseStackDockerMetadata(input.rootDirectory, configProjectId)

  return evaluateSupabaseStackProvenance({
    systemId: input.systemId,
    rootDirectory: input.rootDirectory,
    configProjectId,
    identityProjectId: identity?.projectId ?? null,
    identityLegacyGeneric: identity?.legacyGenericProjectId === true,
    dockerWorkdir: meta?.workdir ?? null,
    dockerCliProject: meta?.cliProject ?? null,
    ownerSystemId: input.ownerSystemId,
    foreignActive: input.foreignActive,
  })
}
