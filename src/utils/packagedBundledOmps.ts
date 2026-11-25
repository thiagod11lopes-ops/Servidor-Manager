declare const __MANAGER_PRODUCT_DISPLAY_NAME__: string | undefined

/** Detecta variante Servidor OMPS (payload em resources/) — exposto pelo preload Electron. */
export function isPackagedBundledOmpsProduct(): boolean {
  if (typeof window === 'undefined') return false
  return window.servidorManager?.packagedProduct?.bundledOmps === true
}

function isLocalManagerBrowserHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/** Build OMPS (stamp --omps / build:app:omps) — inclui UI servida em localhost sem Electron. */
export function isServidorOmpsProductUiBuild(): boolean {
  const baked =
    typeof __MANAGER_PRODUCT_DISPLAY_NAME__ === 'string' ? __MANAGER_PRODUCT_DISPLAY_NAME__.trim() : ''
  return baked === 'Servidor OMPS'
}

/** Produto Servidor OMPS (Electron empacotado ou build/UI OMPS). */
export function isServidorOmpsServerProduct(): boolean {
  return isPackagedBundledOmpsProduct() || isServidorOmpsProductUiBuild()
}

/** Servidor OMPS: sem aba/catálogo Sistemas (AcompSolemp vem embutido). */
export function isSystemsNavHidden(): boolean {
  return isServidorOmpsServerProduct()
}

/**
 * Faixa LAN no dashboard: Electron empacotado OU UI OMPS em localhost (dev / serve-manager-ui).
 * Não ativa no Manager genérico nem fora de loopback.
 */
/** Rótulo do card do serviço local (47831) no dashboard. */
export function dashboardLocalServiceCardLabel(): string {
  if (isServidorOmpsServerProduct() || isPackagedBundledOmpsProduct()) {
    return 'Serviço Local OMPS'
  }
  return 'Serviço local do Manager'
}

export function shouldShowOmpsDashboardLanAccess(): boolean {
  if (!isServidorOmpsServerProduct()) return false
  if (isPackagedBundledOmpsProduct()) return true
  return import.meta.env.DEV || isLocalManagerBrowserHost()
}
