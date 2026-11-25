import { autoStartAndWaitDockerEngine } from '../docker/dockerDesktopEnsure.ts'
import { manifestRequiresDocker } from '../serverManifest/manifestRequiresDocker.ts'
import type { ServerManifest } from '../serverManifest/types.ts'

export type ManifestDockerGateResult =
  | { ok: true }
  | { ok: false; paused: true }
  | { ok: false; error: string }

/** Auto-inicia Docker Desktop (Windows) e aguarda `docker info` até o limite; pausa se ainda não estiver pronto. */
export async function runManifestInstallDockerGate(input: {
  manifest: ServerManifest
  onProgress?: (message: string) => void
  autoWaitMs?: number
}): Promise<ManifestDockerGateResult> {
  if (!manifestRequiresDocker(input.manifest)) {
    return { ok: true }
  }

  const docker = await autoStartAndWaitDockerEngine({
    autoWaitMs: input.autoWaitMs,
    onProgress: input.onProgress,
  })

  if (docker.ok) return { ok: true }

  if (docker.code === 'not_installed') {
    return { ok: false, error: docker.message }
  }

  return { ok: false, paused: true }
}
