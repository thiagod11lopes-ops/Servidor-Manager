import { ServerUnifiedPanel } from '../components/monitoring/ServerUnifiedPanel.tsx'

type ServerPageProps = {
  focusSystemId?: string | null
  onNavigateUsers: (systemId: string) => void
  onFocusSystem: (systemId: string) => void
}

export function ServerPage({ focusSystemId, onNavigateUsers, onFocusSystem }: ServerPageProps) {
  return (
    <section className="page page-server">
      <div className="server-tab-body">
        <ServerUnifiedPanel
          focusSystemId={focusSystemId}
          onNavigateUsers={onNavigateUsers}
          onFocusSystem={onFocusSystem}
        />
      </div>
    </section>
  )
}
