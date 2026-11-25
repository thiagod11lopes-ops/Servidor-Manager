import type { ChecklistActionTarget, ChecklistItemStatus } from '../utils/serverOperationalChecklist.ts'
import { buildServerOperationalChecklist } from '../utils/serverOperationalChecklist.ts'
import type { ServerBootstrapStatus } from '../types/serverBootstrap.ts'
import type { ManagedSystem } from '../types/system.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'

type ServerOperationalChecklistPanelProps = {
  system: ManagedSystem
  runtimeStatus: SystemRuntimeStatus | null | undefined
  bootstrapLoading: boolean
  bootstrapStatus: ServerBootstrapStatus | null
  onAction: (target: ChecklistActionTarget) => void
  embedded?: boolean
}

function statusLabel(status: ChecklistItemStatus): string {
  switch (status) {
    case 'done':
      return 'Concluído'
    case 'pending':
      return 'Pendente'
    case 'failed':
      return 'Falha'
    case 'not_applicable':
      return 'N/A'
  }
}

function badgeClass(status: ChecklistItemStatus): string {
  if (status === 'done') return 'badge badge-real'
  if (status === 'failed') return 'badge badge-mock'
  return 'badge badge-plan'
}

export function ServerOperationalChecklistPanel({
  system,
  runtimeStatus,
  bootstrapLoading,
  bootstrapStatus,
  onAction,
  embedded = false,
}: ServerOperationalChecklistPanelProps) {
  const checklist = buildServerOperationalChecklist({
    bootstrapLoading,
    bootstrapStatus,
    system,
    runtimeStatus,
  })

  const list = (
    <>
      <p className="analysis-disclaimer">{checklist.summary}</p>
      <ul className="server-checklist-list">
        {checklist.items.map((item) => (
          <li key={item.id} className={`server-checklist-item server-checklist-${item.status}`}>
            <div className="server-checklist-row">
              <span className={badgeClass(item.status)}>{statusLabel(item.status)}</span>
              <span className="server-checklist-title">{item.title}</span>
            </div>
            <p className="analysis-meta server-checklist-detail">{item.detail}</p>
            {item.action ? (
              <button
                type="button"
                className="link-button server-checklist-action"
                onClick={() => onAction(item.action!.target)}
              >
                {item.action.label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )

  if (embedded) {
    return <div className="server-operational-checklist server-operational-checklist-embedded">{list}</div>
  }

  return (
    <section
      className="analysis-panel server-operational-checklist"
      aria-labelledby="server-checklist-title"
    >
      <div className="analysis-header">
        <h2 id="server-checklist-title" className="analysis-title">
          Checklist — servidor AcompSolemp
        </h2>
        <span
          className={`badge ${checklist.lanEssentialsReady ? 'badge-real' : 'badge-mock'}`}
        >
          {checklist.lanEssentialsReady ? 'LAN ESSENCIAL OK' : 'PENDÊNCIAS'}
        </span>
      </div>
      {list}
    </section>
  )
}

export function checklistCardStatus(input: {
  bootstrapLoading: boolean
  bootstrapStatus: ServerBootstrapStatus | null
  system: ManagedSystem
  runtimeStatus: SystemRuntimeStatus | null | undefined
}): { label: string; tone: 'success' | 'error' | 'muted' } {
  const checklist = buildServerOperationalChecklist(input)
  return {
    label: checklist.lanEssentialsReady ? 'LAN essencial OK' : 'Pendências',
    tone: checklist.lanEssentialsReady ? 'success' : 'error',
  }
}
