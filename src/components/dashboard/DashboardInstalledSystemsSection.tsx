import type { DashboardInstalledSystemRow } from '../../types/dashboard.ts'

type DashboardInstalledSystemsSectionProps = {
  rows: DashboardInstalledSystemRow[]
  metricsReady: boolean
  onOpenSystems: () => void
  onOpenSystemServer: (systemId: string) => void
  onOpenSystemInSystems: (systemId: string) => void
}

export function DashboardInstalledSystemsSection({
  rows,
  metricsReady,
  onOpenSystems,
  onOpenSystemServer,
  onOpenSystemInSystems,
}: DashboardInstalledSystemsSectionProps) {
  return (
    <section className="analysis-panel dashboard-installed-systems" aria-label="Sistemas instalados">
      <div className="dashboard-section-heading">
        <h2 className="analysis-title">Sistemas instalados</h2>
        <button type="button" className="link-button" onClick={onOpenSystems}>
          Gerir todos
        </button>
      </div>
      <p className="analysis-disclaimer">
        Instalações confirmadas em <code>C:\ServidorManager\systems</code> — acesse e administre sem
        depender do cadastro só na UI.
      </p>

      {!metricsReady ? (
        <p className="analysis-disclaimer">Carregando inventário…</p>
      ) : rows.length === 0 ? (
        <p className="analysis-disclaimer">
          Nenhum sistema instalado no disco. Use <strong>Meus Sistemas</strong> para analisar e instalar.
        </p>
      ) : (
        <div className="dashboard-installed-table-wrap">
          <table className="dashboard-installed-table">
            <thead>
              <tr>
                <th scope="col">Sistema</th>
                <th scope="col">Estado</th>
                <th scope="col">BNC</th>
                <th scope="col">Acesso</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.systemId} className={row.isRunning ? 'is-running' : undefined}>
                  <td>
                    <span className="dashboard-installed-name">{row.label}</span>
                    <span className="dashboard-installed-id">{row.systemId.slice(0, 8)}…</span>
                  </td>
                  <td>
                    <span className={row.state === 'erro' ? 'dashboard-operational-tone-error' : undefined}>
                      {row.stateLabel}
                    </span>
                  </td>
                  <td>{row.databaseNumber ?? '—'}</td>
                  <td>
                    {row.loginUrl ? (
                      <a href={row.loginUrl} target="_blank" rel="noreferrer" className="dashboard-installed-link">
                        Abrir login
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="dashboard-installed-actions">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => onOpenSystemInSystems(row.systemId)}
                    >
                      Sistemas
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => onOpenSystemServer(row.systemId)}
                    >
                      Servidor
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
