import { discoverInstalledSystems } from '../../systems/discoverInstalledSystems.ts'
import { SUPPORTED_BACKEND_PROFILE } from '../../serverManifest/types.ts'
import { resolveSystemDatabaseUrl } from './resolveSystemDatabase.ts'
import { formatBrowserPsqlError } from './formatBrowserPsqlError.ts'
import type { PsqlConnection } from './psqlConnection.ts'
import { runPsqlQuery } from './psqlReadonly.ts'
import {
  assertSqlIdentifier,
  escapeIlikePattern,
  qualifiedTable,
  quoteSqlIdent,
} from './sqlIdentifiers.ts'

const HIDDEN_SCHEMAS = new Set(['pg_catalog', 'information_schema', 'pg_toast'])

export type BrowserSystemRow = {
  systemId: string
  serverManifestProfile: string | null
  databaseReady: boolean
  detail: string
}

export type BrowserTableRef = {
  schema: string
  name: string
  estimatedRows: number | null
}

export type BrowserSchemaGroup = {
  schema: string
  tables: BrowserTableRef[]
}

export type BrowserColumnMeta = {
  name: string
  dataType: string
  udtName: string
  nullable: boolean
}

function parsePipeRows(stdout: string): string[][] {
  return stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => line.split('|'))
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function tableExists(psql: PsqlConnection, schema: string, table: string): Promise<boolean> {
  const sql = `SELECT 1 FROM information_schema.tables WHERE table_schema = ${sqlLiteral(schema)} AND table_name = ${sqlLiteral(table)} AND table_type = 'BASE TABLE' LIMIT 1;`
  const result = await runPsqlQuery(psql, sql)
  if (!result.ok) return false
  return result.stdout.trim() === '1'
}

export async function listBrowserSystems(): Promise<{ ok: true; systems: BrowserSystemRow[] }> {
  const installed = await discoverInstalledSystems()
  const systems: BrowserSystemRow[] = []

  for (const row of installed) {
    if (row.serverManifestProfile !== SUPPORTED_BACKEND_PROFILE) {
      systems.push({
        systemId: row.systemId,
        serverManifestProfile: row.serverManifestProfile,
        databaseReady: false,
        detail: 'Perfil sem Supabase local integrado.',
      })
      continue
    }

    const resolved = await resolveSystemDatabaseUrl(row.systemId, { allowSupabaseStart: false })
    systems.push({
      systemId: row.systemId,
      serverManifestProfile: row.serverManifestProfile,
      databaseReady: resolved.ok,
      detail: resolved.ok ? 'PostgreSQL local acessível.' : resolved.message,
    })
  }

  return { ok: true, systems }
}

export async function fetchTableCatalog(systemId: string): Promise<
  | { ok: true; schemas: BrowserSchemaGroup[] }
  | { ok: false; code: string; message: string }
> {
  const resolved = await resolveSystemDatabaseUrl(systemId, { allowSupabaseStart: true })
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message }
  }

  const sql = `
SELECT table_schema, table_name, COALESCE(c.reltuples, 0)::bigint AS est_rows
FROM information_schema.tables t
LEFT JOIN pg_namespace n ON n.nspname = t.table_schema
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.table_name AND c.relkind = 'r'
WHERE t.table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;
`.trim()

  const result = await runPsqlQuery(resolved.psql, sql)
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message:
        result.code === 'PERMISSION_DENIED'
          ? 'Sem permissão para ler o catálogo.'
          : formatBrowserPsqlError(result.detail, result.code),
    }
  }

  const groups = new Map<string, BrowserTableRef[]>()
  for (const parts of parsePipeRows(result.stdout)) {
    if (parts.length < 2) continue
    const schema = parts[0]
    const name = parts[1]
    if (HIDDEN_SCHEMAS.has(schema)) continue
    try {
      assertSqlIdentifier(schema, 'SCHEMA')
      assertSqlIdentifier(name, 'TABLE')
    } catch {
      continue
    }
    const est = parts[2] != null ? Number.parseInt(parts[2], 10) : null
    const estimatedRows = Number.isFinite(est) ? Math.max(0, est) : null
    const list = groups.get(schema) ?? []
    list.push({ schema, name, estimatedRows })
    groups.set(schema, list)
  }

  const schemas: BrowserSchemaGroup[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([schema, tables]) => ({
      schema,
      tables: tables.sort((a, b) => a.name.localeCompare(b.name)),
    }))

  return { ok: true, schemas }
}

export async function fetchTableColumns(
  systemId: string,
  schema: string,
  table: string,
): Promise<
  | { ok: true; columns: BrowserColumnMeta[]; rowCount: number | null; rowCountExact: boolean }
  | { ok: false; code: string; message: string }
> {
  let safeSchema: string
  let safeTable: string
  try {
    safeSchema = assertSqlIdentifier(schema, 'SCHEMA')
    safeTable = assertSqlIdentifier(table, 'TABLE')
  } catch {
    return { ok: false, code: 'INVALID_TABLE', message: 'Schema ou tabela inválidos.' }
  }

  const resolved = await resolveSystemDatabaseUrl(systemId, { allowSupabaseStart: true })
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message }
  }

  if (!(await tableExists(resolved.psql, safeSchema, safeTable))) {
    return { ok: false, code: 'TABLE_NOT_FOUND', message: 'Tabela não encontrada neste banco.' }
  }

  const colSql = `
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = ${sqlLiteral(safeSchema)} AND table_name = ${sqlLiteral(safeTable)}
ORDER BY ordinal_position;
`.trim()

  const colResult = await runPsqlQuery(resolved.psql, colSql)
  if (!colResult.ok) {
    return {
      ok: false,
      code: colResult.code,
      message:
        colResult.code === 'PERMISSION_DENIED'
          ? 'Sem permissão para ler colunas.'
          : formatBrowserPsqlError(colResult.detail, colResult.code),
    }
  }

  const columns: BrowserColumnMeta[] = []
  for (const parts of parsePipeRows(colResult.stdout)) {
    if (parts.length < 4) continue
    columns.push({
      name: parts[0],
      dataType: parts[1],
      udtName: parts[2],
      nullable: parts[3] === 'YES',
    })
  }

  const countSql = `SELECT count(*)::bigint FROM ${qualifiedTable(safeSchema, safeTable)};`
  const countResult = await runPsqlQuery(resolved.psql, countSql)
  let rowCount: number | null = null
  if (countResult.ok) {
    const parsed = Number.parseInt(countResult.stdout.trim(), 10)
    rowCount = Number.isFinite(parsed) ? parsed : null
  }

  return { ok: true, columns, rowCount, rowCountExact: countResult.ok }
}

export type BrowserRowsQuery = {
  page: number
  pageSize: number
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  search?: string
  searchColumn?: string
}

export async function fetchTableRows(
  systemId: string,
  schema: string,
  table: string,
  query: BrowserRowsQuery,
): Promise<
  | {
      ok: true
      rows: Record<string, unknown>[]
      page: number
      pageSize: number
      totalRows: number | null
    }
  | { ok: false; code: string; message: string }
> {
  let safeSchema: string
  let safeTable: string
  try {
    safeSchema = assertSqlIdentifier(schema, 'SCHEMA')
    safeTable = assertSqlIdentifier(table, 'TABLE')
  } catch {
    return { ok: false, code: 'INVALID_TABLE', message: 'Schema ou tabela inválidos.' }
  }

  const page = Math.max(1, query.page)
  const pageSize = Math.min(200, Math.max(1, query.pageSize))
  const offset = (page - 1) * pageSize

  const resolved = await resolveSystemDatabaseUrl(systemId, { allowSupabaseStart: true })
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message }
  }

  if (!(await tableExists(resolved.psql, safeSchema, safeTable))) {
    return { ok: false, code: 'TABLE_NOT_FOUND', message: 'Tabela não encontrada neste banco.' }
  }

  const meta = await fetchTableColumns(systemId, safeSchema, safeTable)
  if (!meta.ok) {
    return meta
  }

  const columnNames = meta.columns.map((c) => c.name)
  if (columnNames.length === 0) {
    return { ok: true, rows: [], page, pageSize, totalRows: meta.rowCount }
  }

  let sortColumn = columnNames[0]
  if (query.sortColumn) {
    try {
      const requested = assertSqlIdentifier(query.sortColumn, 'COLUMN')
      if (!columnNames.includes(requested)) {
        return { ok: false, code: 'INVALID_SORT', message: 'Coluna de ordenação inválida.' }
      }
      sortColumn = requested
    } catch {
      return { ok: false, code: 'INVALID_SORT', message: 'Coluna de ordenação inválida.' }
    }
  }

  const sortDir = query.sortDirection === 'desc' ? 'DESC' : 'ASC'
  const qTable = qualifiedTable(safeSchema, safeTable)

  let whereClause = ''
  const search = query.search?.trim()
  if (search) {
    let searchColumn = columnNames.find((name) => {
      const col = meta.columns.find((c) => c.name === name)
      return col && /char|text|uuid|name/i.test(col.dataType + col.udtName)
    })
    if (query.searchColumn) {
      try {
        const requested = assertSqlIdentifier(query.searchColumn, 'COLUMN')
        if (!columnNames.includes(requested)) {
          return { ok: false, code: 'INVALID_SEARCH', message: 'Coluna de busca inválida.' }
        }
        searchColumn = requested
      } catch {
        return { ok: false, code: 'INVALID_SEARCH', message: 'Coluna de busca inválida.' }
      }
    }
    if (!searchColumn) {
      return { ok: false, code: 'SEARCH_UNSUPPORTED', message: 'Nenhuma coluna de texto disponível para busca.' }
    }
    const escaped = escapeIlikePattern(search)
    whereClause = ` WHERE ${quoteSqlIdent(searchColumn)}::text ILIKE ${sqlLiteral(`%${escaped}%`)} ESCAPE '\\'`
  }

  const dataSql = `
SELECT coalesce(json_agg(row_to_json(sub)), '[]'::json)::text
FROM (
  SELECT * FROM ${qTable}${whereClause}
  ORDER BY ${quoteSqlIdent(sortColumn)} ${sortDir} NULLS LAST
  LIMIT ${pageSize} OFFSET ${offset}
) sub;
`.trim()

  const dataResult = await runPsqlQuery(resolved.psql, dataSql)
  if (!dataResult.ok) {
    return {
      ok: false,
      code: dataResult.code,
      message:
        dataResult.code === 'PERMISSION_DENIED'
          ? 'Sem permissão para ler registros desta tabela (RLS ou privilégios).'
          : formatBrowserPsqlError(dataResult.detail, dataResult.code),
    }
  }

  let rows: Record<string, unknown>[] = []
  try {
    const parsed = JSON.parse(dataResult.stdout.trim() || '[]') as unknown
    if (Array.isArray(parsed)) {
      rows = parsed.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
    }
  } catch {
    return { ok: false, code: 'PARSE_FAILED', message: 'Não foi possível interpretar os registros retornados.' }
  }

  return {
    ok: true,
    rows,
    page,
    pageSize,
    totalRows: meta.rowCount,
  }
}
