import { analyzeProjectTree, resolveProjectRoot } from '../analysis/analyzeProjectTree.ts'
import { collectPlanHints } from '../analysis/collectPlanHints.ts'
import { ensureDockerEngineReady } from '../docker/dockerDesktopEnsure.ts'
import { checkManifestServerPrerequisites } from '../serverManifest/checkManifestServerPrerequisites.ts'
import { manifestRequiresDocker } from '../serverManifest/manifestRequiresDocker.ts'
import { inspectServerManifest } from '../serverManifest/summarizeServerManifest.ts'
import { SUPPORTED_BACKEND_PROFILE } from '../serverManifest/types.ts'

export async function inspectProjectDirectory(input: {
  projectDir: string
  sourceUrl: string
  gitRef?: string | null
}) {
  const analysis = await analyzeProjectTree({
    projectDir: input.projectDir,
    sourceUrl: input.sourceUrl,
  })

  const projectRoot = await resolveProjectRoot(input.projectDir)
  const hints = await collectPlanHints(projectRoot, {
    buildTool: analysis.buildTool,
    framework: analysis.framework,
    hasBackend: analysis.hasBackend,
  })

  const manifest = await inspectServerManifest({
    rootDirectory: input.projectDir,
    gitRef: input.gitRef ?? null,
    runValidationScript: false,
  })

  if (
    manifest.found &&
    manifest.summary &&
    manifest.loaded &&
    manifest.summary.backendProfile === SUPPORTED_BACKEND_PROFILE
  ) {
    const summary = manifest.summary
    if (manifestRequiresDocker(manifest.loaded.manifest)) {
      const docker = await ensureDockerEngineReady()
      if (!docker.ok) {
        throw new Error(`DOCKER_NOT_READY:${docker.code}:${docker.message}`)
      }
    }
    const prerequisites = await checkManifestServerPrerequisites(manifest.loaded.manifest)
    const result = {
      ...analysis,
      projectName: summary.productDisplayName,
      technologies: [...new Set([...analysis.technologies, 'Supabase local', 'Caddy'])],
      hasBackend: true,
      backendRequired: true,
      backendDetail: 'Supabase local (Docker) + Caddy via server-manifest.json',
      databaseRequired: true,
      databaseDetail: 'PostgreSQL (Supabase local via Docker)',
      runCommands: [] as string[],
      devCommands: [] as string[],
      disclaimer:
        'Análise real dos arquivos do projeto. Manifesto server-manifest.json detectado — instalação segue installPlan (sem preview Vite :4173; Supabase local).',
      serverManifest: {
        ...summary,
        prerequisites: prerequisites.ok
          ? { ok: true as const, platform: prerequisites.platform, checked: prerequisites.checked }
          : {
              ok: false as const,
              platform: prerequisites.platform,
              missing: prerequisites.missing,
            },
      },
    }
    return { result, hints }
  }

  return { result: analysis, hints }
}
