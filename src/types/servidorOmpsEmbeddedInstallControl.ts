import type { InstallationProgressSnapshot } from './installationProgress.ts'

export type ServidorOmpsEmbeddedInstallControlResponse =
  | {
      ok: true
      action: 'pause' | 'restart'
      message: string
      systemId: string | null
      progress: InstallationProgressSnapshot | null
    }
  | { ok: false; message: string }
