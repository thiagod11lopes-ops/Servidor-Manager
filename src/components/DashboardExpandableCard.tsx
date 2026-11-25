import { useId, useState, type ReactNode } from 'react'

export type DashboardCardStatusTone = 'normal' | 'success' | 'error' | 'muted'

type DashboardExpandableCardProps = {
  id?: string
  title: string
  status: ReactNode
  statusTone?: DashboardCardStatusTone
  defaultOpen?: boolean
  /** Sem seta e corpo sempre visível (não recolhe). */
  alwaysExpanded?: boolean
  className?: string
  children: ReactNode
}

export function DashboardExpandableCard({
  id,
  title,
  status,
  statusTone = 'normal',
  defaultOpen = false,
  alwaysExpanded = false,
  className,
  children,
}: DashboardExpandableCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const expanded = alwaysExpanded || open

  const header = (
    <>
      <span className="dashboard-expandable-title">{title}</span>
      <span className={`dashboard-expandable-status dashboard-expandable-status-${statusTone}`}>{status}</span>
      {alwaysExpanded ? null : (
        <span className="collapsible-chevron dashboard-expandable-chevron" data-open={open ? 'true' : 'false'} aria-hidden>
          ▾
        </span>
      )}
    </>
  )

  return (
    <section
      id={id}
      className={`analysis-panel dashboard-expandable-card${expanded ? ' is-open' : ' is-collapsed'}${alwaysExpanded ? ' is-always-expanded' : ''}${className ? ` ${className}` : ''}`}
    >
      {alwaysExpanded ? (
        <div className="dashboard-expandable-trigger dashboard-expandable-trigger-static">{header}</div>
      ) : (
        <button
          type="button"
          className="dashboard-expandable-trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {header}
        </button>
      )}
      {expanded ? (
        <div id={panelId} className="dashboard-expandable-body">
          {children}
        </div>
      ) : null}
    </section>
  )
}
