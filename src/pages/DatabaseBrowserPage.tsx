import { useCallback, useEffect, useMemo, useState } from 'react'
import { HttpLocalManagerClient } from '../services/httpLocalManagerClient.ts'
import { loadSystems } from '../storage/systemsStorage.ts'
import type {
  DatabaseBrowserColumn,
  DatabaseBrowserSchemaGroup,
  DatabaseBrowserSystem,
} from '../types/databaseBrowser.ts'
import { formatDatabaseBrowserClientError } from '../utils/databaseBrowserErrors.ts'

const client = new HttpLocalManagerClient()
const PAGE_SIZE = 50

type SelectedTable = { schema: string; name: string }

type DatabaseBrowserPageProps = {
  initialSystemId?: string | null
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value)
      return json.length > 240 ? `${json.slice(0, 237)}…` : json
    } catch {
      return String(value)
    }
  }
  const text = String(value)
  return text.length > 320 ? `${text.slice(0, 317)}…` : text
}

function typeLabel(column: DatabaseBrowserColumn): string {
  if (column.udtName && column.udtName !== column.dataType) {
    return `${column.dataType} (${column.udtName})`
  }
  return column.dataType
}

export function DatabaseBrowserPage({ initialSystemId }: DatabaseBrowserPageProps) {
  const registeredIds = useMemo(() => new Set(loadSystems().map((s) => s.id)), [])
  const [systems, setSystems] = useState<DatabaseBrowserSystem[]>([])
  const [systemsLoading, setSystemsLoading] = useState(true)
  const [systemId, setSystemId] = useState(initialSystemId ?? '')
  const [catalog, setCatalog] = useState<DatabaseBrowserSchemaGroup[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedTable | null>(null)
  const [columns, setColumns] = useState<DatabaseBrowserColumn[]>([])
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [page, setPage] = useState(1)
  const [sortColumn, setSortColumn] = useState<string | undefined>()
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)

  const refreshSystems = useCallback(async () => {
    setSystemsLoading(true)
    try {
      const payload = await client.getDatabaseBrowserSystems()
      const list = payload.systems ?? []
      setSystems(list)
      setSystemId((current) => {
        if (current && list.some((s) => s.systemId === current)) return current
        const preferred =
          list.find((s) => s.databaseReady && registeredIds.has(s.systemId)) ??
          list.find((s) => s.databaseReady) ??
          list[0]
        return preferred?.systemId ?? ''
      })
    } catch (error) {
      setSystems([])
      setCatalogError(formatDatabaseBrowserClientError(error))
    } finally {
      setSystemsLoading(false)
    }
  }, [registeredIds])

  useEffect(() => {
    void refreshSystems()
  }, [refreshSystems])

  const refreshCatalog = useCallback(async () => {
    if (!systemId) return
    setCatalogLoading(true)
    setCatalogError(null)
    setSelected(null)
    setColumns([])
    setRows([])
    setRowCount(null)
    try {
      const response = await client.getDatabaseBrowserCatalog(systemId)
      if (!response.ok) {
        setCatalog([])
        setCatalogError(response.message)
        return
      }
      setCatalog(response.schemas)
    } catch (error) {
      setCatalog([])
      setCatalogError(formatDatabaseBrowserClientError(error))
    } finally {
      setCatalogLoading(false)
    }
  }, [systemId])

  useEffect(() => {
    void refreshCatalog()
  }, [refreshCatalog])

  const loadTable = useCallback(async () => {
    if (!systemId || !selected) return
    setTableLoading(true)
    setTableError(null)
    try {
      const meta = await client.getDatabaseBrowserTableMeta(systemId, selected.schema, selected.name)
      if (!meta.ok) {
        setColumns([])
        setRows([])
        setRowCount(null)
        setTableError(meta.message)
        return
      }
      setColumns(meta.columns)
      setRowCount(meta.rowCount)
      if (!sortColumn && meta.columns[0]) {
        setSortColumn(meta.columns[0].name)
      }

      const data = await client.getDatabaseBrowserRows(systemId, selected.schema, selected.name, {
        page,
        pageSize: PAGE_SIZE,
        sortColumn: sortColumn ?? meta.columns[0]?.name,
        sortDirection,
        search: search || undefined,
      })
      if (!data.ok) {
        setRows([])
        setTableError(data.message)
        return
      }
      setRows(data.rows)
      if (data.totalRows != null) setRowCount(data.totalRows)
    } catch (error) {
      setRows([])
      setTableError(formatDatabaseBrowserClientError(error))
    } finally {
      setTableLoading(false)
    }
  }, [systemId, selected, page, sortColumn, sortDirection, search])

  useEffect(() => {
    void loadTable()
  }, [loadTable])

  function selectTable(schema: string, name: string) {
    setSelected({ schema, name })
    setPage(1)
    setSortColumn(undefined)
    setSortDirection('asc')
    setSearch('')
    setSearchDraft('')
    setTableError(null)
  }

  function toggleSort(columnName: string) {
    if (sortColumn === columnName) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(columnName)
      setSortDirection('asc')
    }
    setPage(1)
  }

  const activeSystem = systems.find((s) => s.systemId === systemId)
  const totalPages =
    rowCount != null && rowCount > 0 ? Math.max(1, Math.ceil(rowCount / PAGE_SIZE)) : null

  return (
    <section className="page page-database-browser">
      <div className="db-browser-toolbar">
        <label className="db-browser-field">
          Sistema
          <select
            value={systemId}
            disabled={systemsLoading}
            onChange={(e) => setSystemId(e.target.value)}
          >
            {systems.length === 0 ? <option value="">Nenhum sistema instalado</option> : null}
            {systems.map((s) => (
              <option key={s.systemId} value={s.systemId}>
                {s.systemId}
                {s.databaseReady ? '' : ' — banco indisponível'}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={catalogLoading || !systemId}
          onClick={() => void refreshCatalog()}
        >
          {catalogLoading ? 'Atualizando…' : 'Atualizar tabelas'}
        </button>
        {activeSystem ? (
          <p className="db-browser-system-status" role="status">
            {activeSystem.detail}
          </p>
        ) : null}
      </div>

      {catalogError ? <p className="field-error db-browser-banner">{catalogError}</p> : null}

      <div className="db-browser-layout">
        <aside className="db-browser-sidebar analysis-panel" aria-label="Tabelas do banco">
          {catalogLoading ? <p className="analysis-disclaimer">Carregando catálogo…</p> : null}
          {!catalogLoading && catalog.length === 0 ? (
            <p className="analysis-disclaimer">Nenhuma tabela listada para este sistema.</p>
          ) : null}
          {catalog.map((group) => (
            <div key={group.schema} className="db-browser-schema-group">
              <p className="db-browser-schema-title">{group.schema}</p>
              <ul className="db-browser-table-list">
                {group.tables.map((table) => {
                  const active =
                    selected?.schema === table.schema && selected?.name === table.name
                  return (
                    <li key={`${table.schema}.${table.name}`}>
                      <button
                        type="button"
                        className={active ? 'db-browser-table-btn is-active' : 'db-browser-table-btn'}
                        onClick={() => selectTable(table.schema, table.name)}
                      >
                        <span>{table.name}</span>
                        {table.estimatedRows != null ? (
                          <span className="db-browser-table-est">~{table.estimatedRows}</span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </aside>

        <div className="db-browser-main analysis-panel">
          {!selected ? (
            <p className="analysis-disclaimer">Selecione uma tabela à esquerda para visualizar registros.</p>
          ) : (
            <>
              <header className="db-browser-table-header">
                <div>
                  <h2 className="db-browser-table-title">
                    {selected.schema}.{selected.name}
                  </h2>
                  <p className="analysis-meta">
                    {rowCount != null
                      ? `${rowCount.toLocaleString('pt-BR')} registro(s)`
                      : 'Contagem indisponível'}
                    {tableLoading ? ' · carregando…' : ''}
                  </p>
                </div>
                <form
                  className="db-browser-search"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setSearch(searchDraft.trim())
                    setPage(1)
                  }}
                >
                  <input
                    type="search"
                    placeholder="Buscar (coluna de texto)…"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                  />
                  <button type="submit" className="button button-secondary button-small">
                    Buscar
                  </button>
                </form>
              </header>

              {tableError ? <p className="field-error">{tableError}</p> : null}

              {columns.length > 0 ? (
                <div className="db-browser-grid-wrap">
                  <table className="db-browser-grid">
                    <thead>
                      <tr>
                        {columns.map((col) => (
                          <th key={col.name}>
                            <button
                              type="button"
                              className="db-browser-col-sort"
                              onClick={() => toggleSort(col.name)}
                            >
                              <span>{col.name}</span>
                              <span className="db-browser-col-type">{typeLabel(col)}</span>
                              {sortColumn === col.name ? (
                                <span aria-hidden>{sortDirection === 'asc' ? ' ▴' : ' ▾'}</span>
                              ) : null}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableLoading && rows.length === 0 ? (
                        <tr>
                          <td colSpan={columns.length}>Carregando registros…</td>
                        </tr>
                      ) : null}
                      {!tableLoading && rows.length === 0 ? (
                        <tr>
                          <td colSpan={columns.length}>Nenhum registro nesta página.</td>
                        </tr>
                      ) : null}
                      {rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {columns.map((col) => {
                            const raw = row[col.name]
                            const isNull = raw === null || raw === undefined
                            return (
                              <td key={col.name} className={isNull ? 'db-browser-cell-null' : undefined}>
                                <code>{formatCellValue(raw)}</code>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {selected && columns.length > 0 ? (
                <div className="db-browser-pagination">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    disabled={page <= 1 || tableLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="analysis-meta">
                    Página {page}
                    {totalPages != null ? ` de ${totalPages}` : ''}
                  </span>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    disabled={
                      tableLoading ||
                      (totalPages != null ? page >= totalPages : rows.length < PAGE_SIZE)
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
