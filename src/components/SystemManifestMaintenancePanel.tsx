import { useState } from 'react'

type SystemManifestMaintenancePanelProps = {
  busy?: boolean
  message?: string
  error?: string
  onBackup: () => void
  onUpdate: (skipBackup: boolean) => void
}

export function SystemManifestMaintenancePanel({
  busy,
  message,
  error,
  onBackup,
  onUpdate,
}: SystemManifestMaintenancePanelProps) {
  const [skipBackup, setSkipBackup] = useState(false)

  return (
    <div className={`analysis-panel${error ? ' analysis-panel-error' : ''}`}>
      <div className="analysis-header">
        <h3 className="analysis-title">Backup e atualização (manifesto)</h3>
      </div>
      <p className="analysis-disclaimer">
        AcompOPMS LAN: atualize com <strong>git pull</strong> e reexecução das fases do{' '}
        <code>server-manifest.json</code> — não use preview Vite na porta :4173. Clientes acessam só a
        porta HTTP do Caddy (ex.: :8080).
      </p>
      {loadingOrBusy(busy) ? <p className="analysis-disclaimer">Operação em andamento…</p> : null}
      {error ? <p className="analysis-disclaimer">{error}</p> : null}
      {message && !error ? <p className="analysis-disclaimer">{message}</p> : null}
      <label className="manifest-overlay-option">
        <input
          type="checkbox"
          checked={skipBackup}
          disabled={busy}
          onChange={(event) => setSkipBackup(event.target.checked)}
        />
        Atualizar sem backup (não recomendado)
      </label>
      <div className="system-actions manifest-maintenance-actions">
        <button type="button" className="button button-secondary button-small" disabled={busy} onClick={onBackup}>
          Backup do banco
        </button>
        <button
          type="button"
          className="button button-primary button-small"
          disabled={busy}
          onClick={() => onUpdate(skipBackup)}
        >
          Atualizar do Git
        </button>
      </div>
    </div>
  )
}

function loadingOrBusy(busy?: boolean): boolean {
  return Boolean(busy)
}
