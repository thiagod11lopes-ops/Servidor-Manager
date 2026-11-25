import { useEffect } from 'react'
import { getManagerProductDisplayName } from '../utils/managerProductDisplayName.ts'

export function useManagerDocumentTitle(pageTitle?: string | null) {
  useEffect(() => {
    const product = getManagerProductDisplayName()
    document.title = pageTitle ? `${pageTitle} — ${product}` : product
  }, [pageTitle])
}
