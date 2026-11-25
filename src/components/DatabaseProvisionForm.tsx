import { useState } from 'react'
import type { PostgresAdminCredentialsInput } from '../types/database.ts'

type DatabaseProvisionFormProps = {
  disabled?: boolean
  loading?: boolean
  onSubmit: (admin: PostgresAdminCredentialsInput) => void
}

export function DatabaseProvisionForm({ disabled, loading, onSubmit }: DatabaseProvisionFormProps) {
  const [user, setUser] = useState('postgres')
  const [password, setPassword] = useState('')

  return (
    <form
      className="database-provision-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!password.trim()) return
        onSubmit({ user: user.trim(), password })
        setPassword('')
      }}
    >
      <p className="analysis-disclaimer">
        Credenciais administrativas do PostgreSQL (somente para esta operação — não são salvas no navegador).
      </p>
      <label className="form-field">
        <span>Usuário administrativo</span>
        <input
          type="text"
          autoComplete="off"
          value={user}
          disabled={disabled || loading}
          onChange={(event) => setUser(event.target.value)}
        />
      </label>
      <label className="form-field">
        <span>Senha administrativa</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={disabled || loading}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit" className="button button-primary button-small" disabled={disabled || loading}>
        {loading ? 'Preparando banco...' : 'Preparar banco'}
      </button>
    </form>
  )
}
