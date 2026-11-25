import type { ServerManifest } from '../serverManifest/types.ts'

/** Referência mínima para checagens de toolchain do perfil supabase-local-v1 (sem clonar AcompSolemp). */
export const REFERENCE_SUPABASE_LOCAL_MANIFEST: ServerManifest = {
  manifestVersion: '1.2.0',
  manager: {
    backendProfile: 'supabase-local-v1',
    supportedPlatforms: ['windows', 'linux'],
  },
  repository: { name: 'reference' },
  system: { name: 'reference' },
  scripts: {
    items: [
      {
        id: 'apply-local-schema',
        path: 'scripts/apply-local-schema.sh',
        interpreter: 'bash',
        platforms: ['linux', 'windows-with-bash'],
        purpose: 'Referência — fase database.schema (mesmo interpretador do AcompSolemp).',
      },
    ],
  },
  installPlan: {
    profile: 'supabase-local-v1',
    phases: [
      {
        id: 'database.schema',
        type: 'script',
        scriptId: 'apply-local-schema',
        description: 'Schema via bash',
      },
    ],
  },
  requirements: {
    node: { minMajorVersion: 20 },
  },
}
