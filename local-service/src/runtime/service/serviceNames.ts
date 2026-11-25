import { assertValidSystemId } from '../../installation/paths.ts'
import { systemIdSlug } from '../../database/provisioning/identifiers.ts'

export function deriveWindowsServiceName(systemId: string): string {
  assertValidSystemId(systemId)
  const slug = systemIdSlug(systemId)
  return `ServidorManager_${slug}`
}
