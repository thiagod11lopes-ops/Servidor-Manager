import { useEffect, useState } from 'react'
import type { BundledOmpsStatus } from '../types/bundledOmps.ts'
import { bundledOmpsFirstRunCompleted } from '../types/bundledOmps.ts'
import { fetchBundledOmpsStatusWithRetry } from '../utils/fetchBundledOmpsStatusWithRetry.ts'
import { isServidorOmpsServerProduct } from '../utils/packagedBundledOmps.ts'

export type BundledOmpsNavPromoProps = {
  onOpenSetup: () => void
  /** Cartão compacto na lista vazia de sistemas. */
  variant?: 'banner' | 'card'
}

export function BundledOmpsNavPromo({ onOpenSetup, variant = 'banner' }: BundledOmpsNavPromoProps) {
  const [status, setStatus] = useState<BundledOmpsStatus | null>(null)
  useEffect(() => {
    void fetchBundledOmpsStatusWithRetry().then(setStatus)
  }, [])

  if (isServidorOmpsServerProduct()) return null

  const firstRunDone = bundledOmpsFirstRunCompleted(status)
  const showFromApi = status?.ok === true && status.available && !firstRunDone

  if (!showFromApi) return null

  if (variant === 'card') {
    return (
      <div className="systems-notice bundled-omps-systems-card" role="status">
        <strong>Servidor OMPS empacotado</strong>
        <p>
          Esta instalação inclui o servidor AcompOPMS pronto para configurar — sem clonar repositório no GitHub.
        </p>
        <button type="button" className="button button-primary" onClick={onOpenSetup}>
          Instalar Servidor OMPS
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-banner bundled-omps-banner" role="status">
      <p>
        <strong>Servidor OMPS</strong> empacotado nesta instalação — configure a primeira instalação sem Git ou
        GitHub.
      </p>
      <button type="button" className="btn primary" onClick={onOpenSetup}>
        Instalar Servidor OMPS
      </button>
    </div>
  )
}
