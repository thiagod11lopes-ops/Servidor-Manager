import type { ServerManifest } from './types.ts'

/** Manifesto declara Docker como ferramenta obrigatória. */
export function manifestRequiresDocker(manifest: ServerManifest): boolean {
  const dockerReq = manifest.requirements?.docker as { required?: unknown } | undefined
  if (dockerReq?.required === true) return true
  if (manifest.manager?.backendProfile === 'supabase-local-v1') return true
  return false
}
