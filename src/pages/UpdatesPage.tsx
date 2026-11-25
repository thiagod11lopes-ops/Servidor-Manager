import { formatUpdateDateTime, useCursorUpdates } from '../hooks/useCursorUpdates.ts'

export function UpdatesPage() {
  const { loading, error, manifest, installedVersion } = useCursorUpdates()

  const manifestVersion = manifest?.currentVersion ?? '—'
  const lastBuiltAt = manifest?.lastBuiltAt
    ? formatUpdateDateTime(manifest.lastBuiltAt)
    : '—'

  return (
    <section className="page">
      <div className="metric-grid updates-summary">
        <article className="metric-card">
          <div className="metric-label">Versão desta instalação</div>
          <div className="metric-value">{installedVersion}</div>
          <div className="metric-detail">Definida no build a partir de package.json</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Versão no manifesto</div>
          <div className="metric-value">{manifestVersion}</div>
          <div className="metric-detail">cursor-updates.json (atualizado a cada build)</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Último build</div>
          <div className="metric-value updates-build-time">{lastBuiltAt}</div>
          <div className="metric-detail">Data e hora gravadas automaticamente</div>
        </article>
      </div>

      {loading ? (
        <p className="updates-status">Carregando histórico…</p>
      ) : null}
      {error ? (
        <p className="updates-status updates-status-error">Não foi possível carregar: {error}</p>
      ) : null}

      {!loading && !error && manifest ? (
        <div className="updates-list">
          {manifest.entries.length === 0 ? (
            <p className="updates-status">Nenhuma entrada registrada ainda.</p>
          ) : (
            manifest.entries.map((entry) => (
              <article key={`${entry.version}-${entry.updatedAt}`} className="updates-entry">
                <header className="updates-entry-header">
                  <span className="updates-version">v{entry.version}</span>
                  <time className="updates-time" dateTime={entry.updatedAt}>
                    {formatUpdateDateTime(entry.updatedAt)}
                  </time>
                </header>
                <h2 className="updates-entry-title">{entry.title}</h2>
                <ul className="updates-changes">
                  {entry.changes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </div>
      ) : null}
    </section>
  )
}
