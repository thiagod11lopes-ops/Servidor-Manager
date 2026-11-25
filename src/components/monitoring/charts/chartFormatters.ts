import { formatBytes } from '../../../utils/formatBytes.ts'

export function formatTooltipBytes(value: number): string {
  return formatBytes(value)
}

export function tooltipBytesFromUnknown(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return formatTooltipBytes(n)
}

export function formatAxisBytes(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(1)} TB`
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} B`
}

export function availabilityNote(availability: string): string {
  if (availability === 'estimated') return ' (estimado)'
  if (availability === 'unavailable') return ''
  return ' (medido)'
}
