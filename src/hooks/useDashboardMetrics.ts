import { useDashboardMetricsContext } from '../contexts/DashboardMetricsContext.tsx'

export type { DashboardMetricsState as DashboardMetrics } from '../contexts/DashboardMetricsContext.tsx'

export function useDashboardMetrics() {
  return useDashboardMetricsContext()
}
