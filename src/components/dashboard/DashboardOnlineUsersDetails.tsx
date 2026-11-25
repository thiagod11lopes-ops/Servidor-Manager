import type { OnlineUsersOverview } from '../../types/monitoring.ts'

type DashboardOnlineUsersDetailsProps = {
  onlineUsers: OnlineUsersOverview
}

function formatActivity(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

export function DashboardOnlineUsersDetails({ onlineUsers }: DashboardOnlineUsersDetailsProps) {
  const collected =
    onlineUsers.collectedAt != null
      ? new Date(onlineUsers.collectedAt).toLocaleString('pt-BR')
      : null

  return (
    <section
      className="analysis-panel dashboard-online-users-details"
      aria-label="Detalhes de usuários online"
    >
      <p className="analysis-disclaimer dashboard-operational-current">
        {onlineUsers.detail}
        {collected ? ` · Atualizado: ${collected}` : null}
      </p>

      {onlineUsers.users.length === 0 ? (
        <p className="analysis-meta">
          Nenhum usuário com sessão ou login recente no intervalo monitorado. Confirme Supabase em
          execução e que há utilizadores autenticados na aplicação.
        </p>
      ) : (
        <div className="dashboard-online-users-table-wrap">
          <table className="bootstrap-deps-table dashboard-online-users-table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Banco</th>
                <th scope="col">Sistema</th>
                <th scope="col">Última atividade</th>
              </tr>
            </thead>
            <tbody>
              {onlineUsers.users.map((user) => (
                <tr key={`${user.systemId}-${user.userId}`}>
                  <td>{user.displayName ?? '—'}</td>
                  <td>{user.email ?? '—'}</td>
                  <td>
                    {user.databaseNumber ? (
                      <span className="database-number-badge" title="Número do banco de dados">
                        {user.databaseNumber}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{user.systemLabel ?? user.systemId.slice(0, 8)}</td>
                  <td>{formatActivity(user.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
