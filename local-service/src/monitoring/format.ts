export { formatBytes } from '../utils/formatBytes.ts'

export function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${Math.round(value)}%`
}
