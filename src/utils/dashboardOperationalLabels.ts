import type { DashboardOperationalDetailStatus } from '../types/monitoring.ts'

/** Rótulos de saúde por componente (spec operacional). */
export function operationalComponentStatusLabel(status: DashboardOperationalDetailStatus): string {
  switch (status) {
    case 'ok':
      return 'Operacional'
    case 'warn':
      return 'Atenção'
    case 'fail':
      return 'Indisponível'
    case 'skip':
      return 'Não aplicável'
    default:
      return 'Verificação pendente'
  }
}

export function operationalComponentStatusTone(
  status: DashboardOperationalDetailStatus,
): 'success' | 'warning' | 'error' | 'muted' {
  if (status === 'ok') return 'success'
  if (status === 'warn') return 'warning'
  if (status === 'fail') return 'error'
  return 'muted'
}
