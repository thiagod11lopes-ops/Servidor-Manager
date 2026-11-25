import { assertValidSystemId } from '../../installation/paths.ts'

const SLUG_RE = /^[a-f0-9]{8}$/

export function systemIdSlug(systemId: string): string {
  assertValidSystemId(systemId)
  const compact = systemId.replace(/-/g, '').toLowerCase()
  return compact.slice(0, 8)
}

export function deriveDatabaseName(systemId: string): string {
  const slug = systemIdSlug(systemId)
  if (!SLUG_RE.test(slug)) {
    throw new Error('INVALID_SYSTEM_ID')
  }
  return `sm_${slug}`
}

export function deriveDatabaseUser(systemId: string): string {
  const slug = systemIdSlug(systemId)
  if (!SLUG_RE.test(slug)) {
    throw new Error('INVALID_SYSTEM_ID')
  }
  return `smu_${slug}`
}

export function assertSafePostgresIdentifier(name: string, expected: string): void {
  if (name !== expected) {
    throw new Error('INVALID_IDENTIFIER')
  }
  if (!/^(sm|smu)_[a-f0-9]{8}$/.test(name)) {
    throw new Error('INVALID_IDENTIFIER')
  }
}
