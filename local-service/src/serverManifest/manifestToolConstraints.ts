import type { ServerManifest } from './types.ts'

/**
 * Restrições verificadas pelo Manager (não pin de versão patch).
 * Fonte: server-manifest.json requirements + CI OMPS (.github/workflows node 20).
 */
export const MANIFEST_TOOL_CONSTRAINTS = {
  nodeMinMajorDefault: 20,
  postgresMajorFromManifest: 17,
  notes: {
    docker: 'Engine deve responder a docker info; Supabase local usa containers CLI.',
    supabaseCli: 'Compatível com supabase start/status usado pelo manifesto 1.2.0 (testado com v2.120.x).',
    caddy: 'CLI no PATH; proxy HTTP LAN (porta ACOMOPMS_HTTP_PORT).',
    psql: 'Cliente psql ou fluxo docker exec documentado no OMPS.',
    bash: 'Linux nativo; Windows via Git Bash para apply-local-schema.sh.',
  },
} as const

export function readManifestNodeMinMajor(manifest: ServerManifest): number {
  const req = manifest.requirements?.node as { minMajorVersion?: unknown } | undefined
  const major = req?.minMajorVersion
  return typeof major === 'number' && major > 0 ? major : MANIFEST_TOOL_CONSTRAINTS.nodeMinMajorDefault
}

export function formatManifestToolConstraintSummary(manifest: ServerManifest): string {
  const minNode = readManifestNodeMinMajor(manifest)
  return [
    `Node.js >= ${minNode}`,
    `PostgreSQL major ${MANIFEST_TOOL_CONSTRAINTS.postgresMajorFromManifest} (supabase/config.toml)`,
    'Docker Engine + Supabase CLI + Caddy + psql + bash',
  ].join('; ')
}
