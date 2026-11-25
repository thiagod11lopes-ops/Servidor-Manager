import { isServidorOmpsServerProduct } from './packagedBundledOmps.ts'

declare const __MANAGER_PRODUCT_DISPLAY_NAME__: string | undefined

export const SERVIDOR_OMPS_PRODUCT_NAME = 'Servidor OMPS'
export const SERVIDOR_MANAGER_PRODUCT_NAME = 'Servidor Manager'

/** Nome comercial visível — variante OMPS empacotada vs Manager genérico. */
export function getManagerProductDisplayName(): string {
  if (isServidorOmpsServerProduct()) return SERVIDOR_OMPS_PRODUCT_NAME
  const baked =
    typeof __MANAGER_PRODUCT_DISPLAY_NAME__ === 'string' ? __MANAGER_PRODUCT_DISPLAY_NAME__.trim() : ''
  if (baked) return baked
  return SERVIDOR_MANAGER_PRODUCT_NAME
}
