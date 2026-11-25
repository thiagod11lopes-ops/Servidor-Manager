import { useId, useState, type ReactNode } from 'react'

type CollapsibleSectionProps = {
  title: string
  defaultOpen?: boolean
  /** Título fixo, sem seta; conteúdo sempre visível. */
  alwaysOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  alwaysOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  if (alwaysOpen) {
    return (
      <div className="collapsible-section is-always-open">
        <p className="collapsible-static-title">{title}</p>
        <div className="collapsible-body">{children}</div>
      </div>
    )
  }

  return (
    <div className="collapsible-section">
      <button
        type="button"
        className="collapsible-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="collapsible-chevron" data-open={open ? 'true' : 'false'} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div id={panelId} className="collapsible-body">
          {children}
        </div>
      ) : null}
    </div>
  )
}
