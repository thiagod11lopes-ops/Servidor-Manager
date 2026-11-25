import { useMemo, useState } from 'react'
import { CollapsibleSection } from '../CollapsibleSection.tsx'
import type { SystemStorageRow } from '../../types/monitoring.ts'
import { SystemsStorageBarChart } from './charts/SystemsStorageBarChart.tsx'

type SortKey = 'name' | 'total' | 'state'

type SystemStorageTableProps = {
  rows: SystemStorageRow[]
  nameById: Record<string, string>
  loading: boolean
  error: string | null
  onOpenAcomp?: (systemId: string) => void
  onOpenUsers?: (systemId: string) => void
  compact?: boolean
}

export function SystemStorageTable({
  rows,
  nameById,
  loading,
  error,
  onOpenAcomp,
  onOpenUsers,
  compact,
}: SystemStorageTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      if (sortKey === 'name') {
        const an = (nameById[a.systemId] ?? a.systemId).toLowerCase()
        const bn = (nameById[b.systemId] ?? b.systemId).toLowerCase()
        return sortAsc ? an.localeCompare(bn) : bn.localeCompare(an)
      }
      if (sortKey === 'state') {
        const as = a.runtimeState ?? ''
        const bs = b.runtimeState ?? ''
        return sortAsc ? as.localeCompare(bs) : bs.localeCompare(as)
      }
      const at = a.totalMeasured.bytes ?? -1
      const bt = b.totalMeasured.bytes ?? -1
      return sortAsc ? at - bt : bt - at
    })
    return copy
  }, [rows, sortKey, sortAsc, nameById])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else {
      setSortKey(key)
      setSortAsc(key === 'name')
    }
  }

  return (
    <section
      className={`analysis-panel monitoring-panel server-systems-panel${compact ? ' server-systems-panel-compact' : ''}`}
      aria-labelledby="system-storage-title"
    >
      <div className="analysis-header">
        <p id="system-storage-title" className="analysis-title">
          Consumo por sistema
        </p>
        {loading ? <span className="badge badge-mock">Medindo…</span> : null}
      </div>
      {error ? <p className="field-error">{error}</p> : null}

      <SystemsStorageBarChart rows={sorted} nameById={nameById} compact={compact} />

      <CollapsibleSection
        title={`Detalhes e ações (${sorted.length} sistema${sorted.length === 1 ? '' : 's'})`}
        defaultOpen={false}
      >
      <table className="bootstrap-deps-table monitoring-system-table">
        <thead>
          <tr>
            <th>
              <button type="button" className="link-button" onClick={() => toggleSort('name')}>
                Sistema
              </button>
            </th>
            <th>
              <button type="button" className="link-button" onClick={() => toggleSort('state')}>
                Estado
              </button>
            </th>
            <th>Projeto</th>
            <th>Banco</th>
            <th>Backups</th>
            <th>
              <button type="button" className="link-button" onClick={() => toggleSort('total')}>
                Total medido
              </button>
            </th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.systemId}>
              <td>{nameById[row.systemId] ?? row.systemId}</td>
              <td>{row.runtimeState ?? '—'}</td>
              <td>{row.projectFiles.label ?? 'Indisponível'}</td>
              <td>{row.database.label ?? 'Indisponível'}</td>
              <td>{row.backups.label ?? 'Indisponível'}</td>
              <td>
                {row.totalMeasured.label ?? 'Indisponível'}
                {row.totalMeasured.availability === 'estimated' ? ' (est.)' : ''}
              </td>
              <td className="monitoring-table-actions">
                {row.serverManifestProfile === 'supabase-local-v1' && onOpenAcomp ? (
                  <button type="button" className="button button-secondary button-small" onClick={() => onOpenAcomp(row.systemId)}>
                    AcompSolemp
                  </button>
                ) : null}
                {row.serverManifestProfile === 'supabase-local-v1' && onOpenUsers ? (
                  <button type="button" className="button button-secondary button-small" onClick={() => onOpenUsers(row.systemId)}>
                    Usuários
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </CollapsibleSection>
    </section>
  )
}
