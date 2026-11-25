import { useEffect, useState } from 'react'
import type { CursorUpdatesManifest } from '../types/cursorUpdates.ts'

const MANAGER_VERSION = __MANAGER_APP_VERSION__

export function useCursorUpdates() {
  const [manifest, setManifest] = useState<CursorUpdatesManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const url = `${import.meta.env.BASE_URL}cursor-updates.json`

    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<CursorUpdatesManifest>
      })
      .then((data) => {
        if (!cancelled) {
          setManifest(data)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar atualizações')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return {
    loading,
    error,
    manifest,
    installedVersion: MANAGER_VERSION,
  }
}

export function formatUpdateDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
