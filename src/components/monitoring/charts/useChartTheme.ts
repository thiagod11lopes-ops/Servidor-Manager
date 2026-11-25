import { useEffect, useState } from 'react'

export type ChartTheme = {
  accent: string
  accentSoft: string
  success: string
  muted: string
  text: string
  border: string
  surface: string
  series: string[]
}

const FALLBACK: ChartTheme = {
  accent: '#2f6fed',
  accentSoft: '#7eb4ff',
  success: '#0b8f62',
  muted: '#5e6d7e',
  text: '#142033',
  border: '#e2e8ef',
  surface: '#ffffff',
  series: ['#2f6fed', '#0b8f62', '#5b9cff', '#854d0e', '#9a6700'],
}

function readTheme(): ChartTheme {
  if (typeof document === 'undefined') return FALLBACK
  const style = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const accent = pick('--accent', FALLBACK.accent)
  return {
    accent,
    accentSoft: pick('--accent-hover', FALLBACK.accentSoft),
    success: pick('--success', FALLBACK.success),
    muted: pick('--muted', FALLBACK.muted),
    text: pick('--text', FALLBACK.text),
    border: pick('--border', FALLBACK.border),
    surface: pick('--surface', FALLBACK.surface),
    series: [accent, pick('--success', FALLBACK.success), pick('--accent-hover', FALLBACK.accentSoft), '#64748b', '#94a3b8'],
  }
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => readTheme())

  useEffect(() => {
    setTheme(readTheme())
    const root = document.documentElement
    const observer = new MutationObserver(() => setTheme(readTheme()))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
