import { localManagerService } from '../services/index.ts'
import type { BundledOmpsStatus } from '../types/bundledOmps.ts'
import { isPackagedBundledOmpsProduct } from './packagedBundledOmps.ts'

const DEFAULT_ATTEMPTS = 24
const DEFAULT_DELAY_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Serviço local (47831) pode demorar a subir após abrir o Electron — evita fallback mock “indisponível”. */
export async function fetchBundledOmpsStatusWithRetry(options?: {
  attempts?: number
  delayMs?: number
}): Promise<BundledOmpsStatus | null> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS
  const packaged = isPackagedBundledOmpsProduct()
  let lastError: unknown = null

  for (let i = 0; i < attempts; i++) {
    try {
      return await localManagerService.getBundledOmpsStatus()
    } catch (error) {
      lastError = error
      if (!packaged && i === 0) break
      if (i < attempts - 1) await sleep(delayMs)
    }
  }

  if (lastError && packaged) return null
  return null
}
