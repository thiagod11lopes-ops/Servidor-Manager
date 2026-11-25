import { useCallback, useEffect, useMemo, useState } from 'react'
import { HttpLocalManagerClient } from '../services/httpLocalManagerClient.ts'
import { loadSystems } from '../storage/systemsStorage.ts'
import { isAcompSolempSystem } from '../utils/isAcompSolempSystem.ts'
import type { AuthUserRow, AuthUsersPage } from '../types/monitoring.ts'
import { formatAuthUsersApiMessage, formatAuthUsersClientError } from '../utils/monitoringUsersErrors.ts'

const client = new HttpLocalManagerClient()

type UsersAdminPageProps = {
  initialSystemId?: string | null
}

export function UsersAdminPage({ initialSystemId }: UsersAdminPageProps) {
  const acompSystems = useMemo(
    () => loadSystems().filter((s) => isAcompSolempSystem(s)),
    [],
  )
  const [systemId, setSystemId] = useState(initialSystemId ?? acompSystems[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [payload, setPayload] = useState<AuthUsersPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!systemId) return
    setLoading(true)
    try {
      const result = await client.getAuthUsersPage(systemId, page, query)
      setPayload(result)
      setActionMessage(result.ok ? null : formatAuthUsersApiMessage(result.message))
    } catch (error) {
      setPayload(null)
      setActionMessage(formatAuthUsersClientError(error))
    } finally {
      setLoading(false)
    }
  }, [systemId, page, query])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleDisable(user: AuthUserRow) {
    if (!systemId) return
    if (!window.confirm(`Desabilitar a conta ${user.email ?? user.id}?`)) return
    const result = await client.disableAuthUser(systemId, user.id)
    setActionMessage(result.message)
    if (result.ok) void refresh()
  }

  async function handleDelete(user: AuthUserRow) {
    if (!systemId) return
    const ok = window.confirm(
      `Excluir ${user.email ?? user.id} do Auth local?\n\nIsso NÃO apaga automaticamente documentos, registros ou arquivos associados.`,
    )
    if (!ok) return
    try {
      const result = await client.deleteAuthUser(systemId, user.id)
      setActionMessage(result.message)
      if (result.ok) void refresh()
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Falha de rede ao excluir usuário.')
    }
  }

  const users = payload?.users ?? []
  const capabilities = payload?.capabilities

  return (
    <section className="page page-dashboard">
      {acompSystems.length === 0 ? (
        <p className="analysis-disclaimer">Nenhum sistema AcompSolemp cadastrado para administração.</p>
      ) : (
        <>
          <div className="monitoring-users-toolbar">
            <label>
              Sistema
              <select value={systemId} onChange={(e) => setSystemId(e.target.value)}>
                {acompSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Buscar e-mail
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                placeholder="parte do e-mail"
              />
            </label>
            <button type="button" className="button button-secondary button-small" disabled={loading} onClick={() => void refresh()}>
              {loading ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>

          {actionMessage ? (
            <p className={actionMessage.includes('removido') ? 'analysis-disclaimer' : 'field-error'}>
              {actionMessage}
            </p>
          ) : null}

          <table className="bootstrap-deps-table monitoring-users-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>ID</th>
                <th>Criado em</th>
                <th>Último acesso</th>
                <th>Estado</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email ?? '—'}</td>
                  <td>
                    <code>{user.id}</code>
                  </td>
                  <td>{user.createdAt ? new Date(user.createdAt).toLocaleString('pt-BR') : '—'}</td>
                  <td>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString('pt-BR') : '—'}</td>
                  <td>{user.banned ? 'Desabilitado' : 'Ativo'}</td>
                  <td className="monitoring-table-actions">
                    {capabilities?.disable ? (
                      <button type="button" className="button button-secondary button-small" onClick={() => void handleDisable(user)}>
                        Desabilitar
                      </button>
                    ) : null}
                    {capabilities?.delete ? (
                      <button type="button" className="button button-danger button-small" onClick={() => void handleDelete(user)}>
                        Excluir Auth
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="monitoring-users-pagination">
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span className="analysis-meta">Página {page}</span>
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={loading || users.length < (payload?.pageSize ?? 25)}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </section>
  )
}
