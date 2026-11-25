export type RemoteValidationState =
  | 'not_applicable'
  | 'candidate_ready'
  | 'needs_external_probe'
  | 'external_report_received'
  | 'external_probe_failed'
  | 'validated'
  | 'failed'
