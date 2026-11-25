import fs from 'node:fs/promises'
import path from 'node:path'
import { appendManifestPhaseLog } from './manifestPhaseLog.ts'
import { loadServidorEnvIntoProcessEnv } from './loadServidorEnvIntoProcessEnv.ts'
import { parseExistingHttpPort } from './maintenancePrepareServidorEnv.ts'
import { resolveServidorEnvPaths } from './prepareServidorEnv.ts'
import { readLanBuildHttpPort } from './readLanBuildHttpPort.ts'
import { runManifestScript } from './scriptRunner.ts'
import type { ManifestPlatform, ManifestScriptItem, ServerManifest } from './types.ts'

const SCRIPT_TIMEOUT_MS = 900_000

function findScript(manifest: ServerManifest, id: string): ManifestScriptItem | null {
  return manifest.scripts?.items?.find((item) => item.id === id) ?? null
}

function resolveBuildProductionScript(
  manifest: ServerManifest,
  platform: ManifestPlatform,
): ManifestScriptItem | null {
  const id = platform === 'windows' ? 'build-production-lan-ps1' : 'build-production-lan-sh'
  return findScript(manifest, id)
}

async function readConfiguredHttpPort(rootDirectory: string, manifest: ServerManifest): Promise<number> {
  const paths = resolveServidorEnvPaths(rootDirectory, manifest)
  try {
    const content = await fs.readFile(paths.envPath, 'utf8')
    return parseExistingHttpPort(content) ?? 8080
  } catch {
    return 8080
  }
}

export type RegenerateLanConsumersResult = {
  ok: boolean
  message: string
  output: string
  rebuiltFrontend: boolean
}

/**
 * Reaplica artefatos que dependem de ACOMOPMS_HTTP_PORT / origem LAN após mudança de porta.
 */
export async function regenerateLanHttpPortConsumers(input: {
  systemId: string
  rootDirectory: string
  manifest: ServerManifest
  platform: ManifestPlatform
  includeFrontendBuild: boolean
  phaseIdForLog?: string
}): Promise<RegenerateLanConsumersResult> {
  const phaseId = input.phaseIdForLog ?? 'proxy.start'
  const httpPort = await readConfiguredHttpPort(input.rootDirectory, input.manifest)
  const chunks: string[] = []

  const log = async (line: string) => {
    chunks.push(line)
    await appendManifestPhaseLog(input.systemId, phaseId, line)
  }

  await log(
    `Regenerando artefatos LAN para porta HTTP ${httpPort} (frontend=${input.includeFrontendBuild ? 'sim' : 'não'}).`,
  )

  const env = await loadServidorEnvIntoProcessEnv(input.rootDirectory, input.manifest)
  let rebuiltFrontend = false

  if (input.includeFrontendBuild) {
    const buildScript = resolveBuildProductionScript(input.manifest, input.platform)
    if (!buildScript) {
      return {
        ok: false,
        message: 'Script build-production-lan não encontrado no manifesto.',
        output: chunks.join('\n'),
        rebuiltFrontend: false,
      }
    }
    const buildRun = await runManifestScript({
      rootDirectory: input.rootDirectory,
      script: buildScript,
      env,
      timeoutMs: SCRIPT_TIMEOUT_MS,
    })
    chunks.push(buildRun.output)
    if (!buildRun.ok) {
      return {
        ok: false,
        message: `Rebuild LAN falhou após mudança de porta (código ${buildRun.exitCode ?? '?'}).`,
        output: chunks.join('\n'),
        rebuiltFrontend: false,
      }
    }
    rebuiltFrontend = true
  } else {
    const generateCaddy = findScript(input.manifest, 'generate-caddyfile')
    const generateConn = findScript(input.manifest, 'generate-server-connection')
    for (const script of [generateCaddy, generateConn]) {
      if (!script) continue
      const run = await runManifestScript({
        rootDirectory: input.rootDirectory,
        script,
        env: await loadServidorEnvIntoProcessEnv(input.rootDirectory, input.manifest),
        timeoutMs: SCRIPT_TIMEOUT_MS,
      })
      chunks.push(run.output)
      if (!run.ok) {
        return {
          ok: false,
          message: `${script.id} falhou após mudança de porta (código ${run.exitCode ?? '?'}).`,
          output: chunks.join('\n'),
          rebuiltFrontend: false,
        }
      }
    }
  }

  return {
    ok: true,
    message: rebuiltFrontend
      ? `Frontend e URLs LAN regenerados para porta ${httpPort}.`
      : `Caddyfile e server-connection regenerados para porta ${httpPort}.`,
    output: chunks.join('\n'),
    rebuiltFrontend,
  }
}

export async function lanBuildHttpPortMismatch(
  rootDirectory: string,
  manifest: ServerManifest,
): Promise<{ mismatch: boolean; envPort: number; buildPort: number | null }> {
  const envPort = await readConfiguredHttpPort(rootDirectory, manifest)
  const buildPort = await readLanBuildHttpPort(rootDirectory)
  return {
    mismatch: buildPort != null && buildPort !== envPort,
    envPort,
    buildPort,
  }
}
