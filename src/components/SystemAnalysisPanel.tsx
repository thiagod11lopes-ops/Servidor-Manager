import type { SystemAnalysisResult } from '../types/systemAnalysis.ts'

type SystemAnalysisPanelProps = {
  loading: boolean
  error?: string
  result?: SystemAnalysisResult
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

function joinCommands(commands: string[] | undefined): string {
  if (!commands || commands.length === 0) return '—'
  return commands.join(' · ')
}

export function SystemAnalysisPanel({ loading, error, result }: SystemAnalysisPanelProps) {
  if (loading) {
    return (
      <div className="analysis-panel analysis-panel-loading">
        <p>Analisando projeto...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="analysis-panel analysis-panel-error">
        <p className="analysis-title">Não foi possível analisar</p>
        <p>{error}</p>
      </div>
    )
  }

  if (!result) return null

  const badgeClass = result.mock ? 'badge badge-mock' : 'badge badge-real'

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <p className="analysis-title">Projeto analisado</p>
        <span className={badgeClass}>{result.mock ? 'MOCK' : 'REAL'}</span>
      </div>
      <p className="analysis-disclaimer">{result.disclaimer}</p>
      {result.serverManifest ? (
        <dl className="analysis-grid analysis-span">
          <div className="analysis-span">
            <dt>Servidor LAN (manifesto)</dt>
            <dd>
              {result.serverManifest.productDisplayName} · perfil {result.serverManifest.backendProfile} · HTTP :{' '}
              {result.serverManifest.httpPort}
            </dd>
          </div>
          {result.serverManifest.prerequisites ? (
            <div className="analysis-span">
              <dt>Pré-requisitos neste PC</dt>
              <dd>
                {result.serverManifest.prerequisites.ok
                  ? `OK (${result.serverManifest.prerequisites.checked.join(', ')})`
                  : result.serverManifest.prerequisites.missing
                      .map((item) => `${item.tool}: ${item.reason}`)
                      .join(' · ')}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <dl className="analysis-grid">
        <div>
          <dt>Nome do projeto</dt>
          <dd>{result.projectName}</dd>
        </div>
        <div>
          <dt>Linguagem</dt>
          <dd>{result.primaryLanguage ?? '—'}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{result.projectType}</dd>
        </div>
        <div>
          <dt>Framework</dt>
          <dd>{result.framework}</dd>
        </div>
        <div>
          <dt>Build</dt>
          <dd>{result.buildTool}</dd>
        </div>
        <div>
          <dt>Gerenciador</dt>
          <dd>{result.packageManager}</dd>
        </div>
        <div>
          <dt>package.json</dt>
          <dd>{result.hasPackageJson ? 'Encontrado' : 'Não encontrado'}</dd>
        </div>
        <div>
          <dt>Frontend</dt>
          <dd>{result.hasFrontend ? 'Sim' : 'Não'}</dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>{result.backendDetail}</dd>
        </div>
        <div>
          <dt>Banco</dt>
          <dd>{result.databaseDetail}</dd>
        </div>
        <div className="analysis-span">
          <dt>Tecnologias</dt>
          <dd>{result.technologies.length > 0 ? result.technologies.join(', ') : '—'}</dd>
        </div>
        <div className="analysis-span">
          <dt>Dependências (amostra)</dt>
          <dd>{result.dependencies?.length ? result.dependencies.join(', ') : '—'}</dd>
        </div>
        <div className="analysis-span">
          <dt>Estrutura (nível superior)</dt>
          <dd>{result.directoryStructure?.length ? result.directoryStructure.join(', ') : '—'}</dd>
        </div>
        <div className="analysis-span">
          <dt>Instalação (sugerido)</dt>
          <dd>{joinCommands(result.installCommands)}</dd>
        </div>
        <div className="analysis-span">
          <dt>Build (sugerido)</dt>
          <dd>{joinCommands(result.buildCommands)}</dd>
        </div>
        <div className="analysis-span">
          <dt>Dev (sugerido)</dt>
          <dd>{joinCommands(result.devCommands)}</dd>
        </div>
        <div className="analysis-span">
          <dt>Execução (sugerido)</dt>
          <dd>{joinCommands(result.runCommands)}</dd>
        </div>
      </dl>
      <p className="analysis-meta">Análise em {formatDate(result.analyzedAt)}</p>
    </div>
  )
}
