import type { InstallationResult } from '../types/installationResult.ts'

type InstallationResultPanelProps = {
  loading: boolean
  error?: string
  result?: InstallationResult
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

export function InstallationResultPanel({ loading, error, result }: InstallationResultPanelProps) {
  if (loading) {
    return (
      <div className="analysis-panel analysis-panel-loading">
        <p>Instalando projeto localmente...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="analysis-panel analysis-panel-error">
        <p className="analysis-title">Instalação não concluída</p>
        <p className="install-error-text">{error}</p>
        {result?.messages?.length ? (
          <ul className="plan-steps install-log">
            {result.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  if (!result) return null

  const loginUrlMessage = result.messages.find((line) => line.includes('Instalador OPMS (startUrl):'))
  const loginUrl = loginUrlMessage?.split(': ').slice(1).join(': ').trim()

  return (
    <div className="analysis-panel plan-panel">
      <div className="analysis-header">
        <p className="analysis-title">Resultado da instalação</p>
        <span className={result.ok ? 'badge badge-real' : 'badge badge-mock'}>
          {result.ok ? 'INSTALADO' : 'FALHA'}
        </span>
      </div>
      <dl className="analysis-grid">
        <div className="analysis-span">
          <dt>Diretório</dt>
          <dd>{result.installDirectory}</dd>
        </div>
        <div className="analysis-span">
          <dt>Projeto</dt>
          <dd>{result.projectDirectory}</dd>
        </div>
        <div>
          <dt>Dependências</dt>
          <dd>{result.dependencyInstall}</dd>
        </div>
        <div>
          <dt>Build</dt>
          <dd>{result.buildStatus}</dd>
        </div>
        <div className="analysis-span">
          <dt>Banco de dados</dt>
          <dd>{result.databaseNote}</dd>
        </div>
        {result.ok && loginUrl ? (
          <div className="analysis-span">
            <dt>URL LAN (Instalador OPMS)</dt>
            <dd>
              <a href={loginUrl} target="_blank" rel="noreferrer">
                {loginUrl}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      <ul className="plan-steps install-log">
        {result.messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      <p className="analysis-meta">Registrado em {formatDate(result.installedAt)}</p>
    </div>
  )
}
