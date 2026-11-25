import type { InstallationProgressSnapshot } from './installationProgress.ts'

export type ServidorOmpsEmbeddedInstallProgressResponse = {
  ok: true
  systemId: string | null
  progress: InstallationProgressSnapshot | null
}
