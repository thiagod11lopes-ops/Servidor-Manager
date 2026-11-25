import type { DashboardUnifiedItem } from '../../types/dashboardUnified.ts'
import {
  CpuIcon,
  DashboardIcon,
  MemoryIcon,
  NetworkIcon,
  PlayCircleIcon,
  ServerIcon,
  SystemsIcon,
  ViewIcon,
} from '../Icons.tsx'

type DashboardUnifiedListProps = {
  gridItems: DashboardUnifiedItem[]
  systemItems?: DashboardUnifiedItem[]
  verifyingId: string | null
  onVerify: (item: DashboardUnifiedItem) => void
}

function ItemIcon({ icon }: { icon: DashboardUnifiedItem['icon'] }) {
  const className = 'dashboard-unified-row-icon'
  switch (icon) {
    case 'systems':
      return <SystemsIcon className={className} />
    case 'cpu':
      return <CpuIcon className={className} />
    case 'memory':
      return <MemoryIcon className={className} />
    case 'users':
      return <NetworkIcon className={className} />
    case 'server':
      return <ServerIcon className={className} />
    case 'prepare':
      return <PlayCircleIcon className={className} />
    case 'system':
      return <SystemsIcon className={className} />
    default:
      return <DashboardIcon className={className} />
  }
}

function VerifyButton({
  item,
  busy,
  disabled,
  onVerify,
  className,
}: {
  item: DashboardUnifiedItem
  busy: boolean
  disabled: boolean
  onVerify: (item: DashboardUnifiedItem) => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label={busy ? `Verificando ${item.name}` : `Ver detalhes de ${item.name}`}
      title={busy ? 'Verificando…' : 'Ver detalhes'}
      onClick={() => onVerify(item)}
    >
      <ViewIcon className={busy ? 'dashboard-unified-verify-spin' : undefined} />
    </button>
  )
}

function UnifiedTile({
  item,
  busy,
  verifyingId,
  onVerify,
}: {
  item: DashboardUnifiedItem
  busy: boolean
  verifyingId: string | null
  onVerify: (item: DashboardUnifiedItem) => void
}) {
  return (
    <article className="dashboard-unified-tile" role="listitem">
      <div className="dashboard-unified-tile-head">
        <ItemIcon icon={item.icon} />
        <h3 className="dashboard-unified-tile-title">{item.name}</h3>
      </div>
      <p
        className={`dashboard-unified-tile-status dashboard-unified-tone-${item.tone}`}
        title={item.statusLabel}
      >
        <span className="dashboard-unified-status-dot" aria-hidden />
        {item.statusLabel}
      </p>
      <VerifyButton
        item={item}
        busy={busy}
        disabled={busy || (verifyingId != null && verifyingId !== item.id)}
        onVerify={onVerify}
        className="button button-secondary button-small dashboard-unified-verify dashboard-unified-verify-icon dashboard-unified-tile-verify"
      />
    </article>
  )
}

function UnifiedRow({
  item,
  busy,
  verifyingId,
  onVerify,
}: {
  item: DashboardUnifiedItem
  busy: boolean
  verifyingId: string | null
  onVerify: (item: DashboardUnifiedItem) => void
}) {
  return (
    <div className="dashboard-unified-row" role="listitem">
      <div className="dashboard-unified-row-name">
        <ItemIcon icon={item.icon} />
        <span className="dashboard-unified-row-title">{item.name}</span>
      </div>
      <span
        className={`dashboard-unified-row-status dashboard-unified-tone-${item.tone}`}
        title={item.statusLabel}
      >
        <span className="dashboard-unified-status-dot" aria-hidden />
        {item.statusLabel}
      </span>
      <VerifyButton
        item={item}
        busy={busy}
        disabled={busy || (verifyingId != null && verifyingId !== item.id)}
        onVerify={onVerify}
        className="button button-secondary button-small dashboard-unified-verify dashboard-unified-verify-icon"
      />
    </div>
  )
}

export function DashboardUnifiedList({
  gridItems,
  systemItems = [],
  verifyingId,
  onVerify,
}: DashboardUnifiedListProps) {
  return (
    <div className="dashboard-unified-shell">
      <div className="dashboard-unified-grid" role="list" aria-label="Indicadores do dashboard">
        {gridItems.map((item) => (
          <UnifiedTile
            key={item.id}
            item={item}
            busy={verifyingId === item.id}
            verifyingId={verifyingId}
            onVerify={onVerify}
          />
        ))}
      </div>

      {systemItems.length > 0 ? (
        <div className="dashboard-unified-list dashboard-unified-systems" role="list" aria-label="Sistemas instalados">
          {systemItems.map((item) => (
            <UnifiedRow
              key={item.id}
              item={item}
              busy={verifyingId === item.id}
              verifyingId={verifyingId}
              onVerify={onVerify}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
