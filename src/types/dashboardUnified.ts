export type DashboardUnifiedTone = 'success' | 'warning' | 'error' | 'muted' | 'checking'

export type DashboardUnifiedItem = {
  id: string
  name: string
  statusLabel: string
  tone: DashboardUnifiedTone
  icon: 'health' | 'systems' | 'cpu' | 'memory' | 'users' | 'server' | 'prepare' | 'system'
}
