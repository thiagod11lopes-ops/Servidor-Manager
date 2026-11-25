const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function assertSqlIdentifier(name: string, label: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 63 || !IDENT_RE.test(trimmed)) {
    throw new Error(`INVALID_${label}`)
  }
  return trimmed
}

export function quoteSqlIdent(name: string): string {
  const safe = assertSqlIdentifier(name, 'IDENT')
  return `"${safe.replace(/"/g, '""')}"`
}

export function qualifiedTable(schema: string, table: string): string {
  return `${quoteSqlIdent(schema)}.${quoteSqlIdent(table)}`
}

export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
