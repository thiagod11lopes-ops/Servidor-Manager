export type InstallationDuplicateLifecycle =
  | 'completed'
  | 'failed'
  | 'in_progress'
  | 'awaiting_docker'
  | 'interrupted'
  | 'partial'

export type InstallationDuplicateSummary = {
  systemId: string
  systemName: string
  repositoryLabel: string
  lifecycle: InstallationDuplicateLifecycle
  lifecycleLabel: string
  lastActivityAt: string | null
  manifestStatus: string | null
  installDirectory: string | null
}

export type InstallationDuplicateOptions = {
  canResume: boolean
  canReplace: boolean
  canOpen: boolean
  canCancel: true
}

export type InstallationOriginMatchTier = 'proven' | 'probable' | 'indeterminate'

export type InstallationDuplicateConflict = {
  ok: false
  code: 'INSTALLATION_DUPLICATE'
  message: string
  existing: InstallationDuplicateSummary
  options: InstallationDuplicateOptions
  originMatch?: InstallationOriginMatchTier
  ambiguous?: boolean
  candidates?: InstallationDuplicateSummary[]
}

export {
  isInstallationDuplicateConflict,
  parseInstallationDuplicateConflict,
} from '../utils/installationDuplicateConflict.ts'

export type BundledOmpsInstallDuplicateDecision =
  | { action: 'resume'; systemId: string }
  | { action: 'replace'; systemId: string; confirmReplace: true }
  | { action: 'cancel' }
