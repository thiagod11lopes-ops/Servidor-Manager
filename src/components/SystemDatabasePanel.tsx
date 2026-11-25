import { DatabaseProvisionForm } from './DatabaseProvisionForm.tsx'
import type {
  DatabaseHostStatus,
  InstallationPlanDatabase,
  PostgresAdminCredentialsInput,
  SystemDatabaseAnalysis,
} from '../types/database.ts'
import { databaseConfidenceLabel, databaseProvisioningStatusLabel } from '../types/database.ts'

type SystemDatabasePanelProps = {
  loading?: boolean
  provisioning?: boolean
  error?: string
  actionMessage?: string
  planDatabase?: InstallationPlanDatabase
  host?: DatabaseHostStatus
  analysis?: SystemDatabaseAnalysis
  canProvision?: boolean
  onProvision?: (admin: PostgresAdminCredentialsInput) => void
}

function formatEnvKeys(keys: string[]): string {
  if (keys.length === 0) return '—'
  return keys.map((key) => `${key}: identificada`).join(' · ')
}

function localServerLabel(
  planDatabase: InstallationPlanDatabase | undefined,
  host: DatabaseHostStatus | undefined,
): string {
  if (!planDatabase?.required || planDatabase.engine !== 'postgresql') {
    return '—'
  }
  if (!host) return 'Verificando...'
  if (!host.postgresql.psqlAvailable && !host.postgresql.pgIsreadyAvailable) {
    return 'Não encontrado'
  }
  if (host.postgresql.serverReachable === true) return 'Disponível'
  if (host.postgresql.serverReachable === false) return 'Indisponível'
  return 'Não confirmado'
}

function needsPostgres(database: InstallationPlanDatabase | undefined, analysis?: SystemDatabaseAnalysis): boolean {
  const engine = analysis?.database.engine ?? database?.engine
  const required = analysis?.database.required ?? database?.required
  return Boolean(required && engine === 'postgresql')
}

export function SystemDatabasePanel({
  loading,
  provisioning,
  error,
  actionMessage,
  planDatabase,
  host,
  analysis,
  canProvision,
  onProvision,
}: SystemDatabasePanelProps) {
  const database = analysis?.database ?? planDatabase
  if (!database && !loading && !error) return null

  const display = database ?? {
    required: false,
    engine: 'none' as const,
    engineLabel: 'Não identificado',
    confidence: 'low' as const,
    detectedFrom: [],
    prerequisites: [],
    environmentVariables: [],
    provisioningRequired: false,
    notes: [],
  }

  const record = analysis?.provisioning
  const postgresRequired = needsPostgres(planDatabase, analysis)
  const showProvisionForm =
    postgresRequired &&
    canProvision &&
    onProvision &&
    record?.status !== 'provisioned' &&
    record?.status !== 'provisioning'

  return (
    <div className={`analysis-panel${error ? ' analysis-panel-error' : ''}`}>
      <div className="analysis-header">
        <h3 className="analysis-title">Banco de Dados</h3>
      </div>
      {loading ? <p className="analysis-disclaimer">Verificando banco de dados...</p> : null}
      {provisioning ? <p className="analysis-disclaimer">Preparando banco...</p> : null}
      {error ? <p className="analysis-disclaimer">{error}</p> : null}
      {actionMessage && !error ? <p className="analysis-disclaimer">{actionMessage}</p> : null}
      <dl className="analysis-grid">
        <div>
          <dt>Detectado</dt>
          <dd>{display.required ? display.engineLabel : 'Não necessário / não identificado'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            {record
              ? databaseProvisioningStatusLabel[record.status]
              : postgresRequired
                ? 'Aguardando verificação'
                : '—'}
          </dd>
        </div>
        <div>
          <dt>Confiança</dt>
          <dd>{databaseConfidenceLabel[display.confidence]}</dd>
        </div>
        <div>
          <dt>Servidor local</dt>
          <dd>{localServerLabel(display, host ?? analysis?.host)}</dd>
        </div>
        {record ? (
          <>
            <div>
              <dt>Banco</dt>
              <dd>{record.databaseName}</dd>
            </div>
            <div>
              <dt>Usuário</dt>
              <dd>{record.databaseUser}</dd>
            </div>
            <div>
              <dt>Host</dt>
              <dd>{record.host}</dd>
            </div>
            <div>
              <dt>Porta</dt>
              <dd>{record.port}</dd>
            </div>
          </>
        ) : null}
        <div className="analysis-span">
          <dt>Pré-requisitos</dt>
          <dd>{display.prerequisites.length > 0 ? display.prerequisites.join(' · ') : '—'}</dd>
        </div>
        <div className="analysis-span">
          <dt>Variáveis (somente nomes)</dt>
          <dd>{formatEnvKeys(display.environmentVariables)}</dd>
        </div>
      </dl>
      {analysis?.messages?.length ? (
        <ul className="install-log">
          {analysis.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      {record?.lastError ? (
        <p className="analysis-disclaimer">Não foi possível preparar o banco: {record.lastError}</p>
      ) : null}
      {showProvisionForm ? (
        <DatabaseProvisionForm
          disabled={loading}
          loading={provisioning}
          onSubmit={(admin) => onProvision(admin)}
        />
      ) : null}
    </div>
  )
}
