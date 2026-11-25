import { deriveLocalProbeUrlFromCanonical } from '../network/deriveLocalProbeUrl.ts'
import { probeLocalHttpUrl } from '../network/probeLocalHttpUrl.ts'
import type { RuntimeStateSnapshot } from './types.ts'

function pickCanonicalUrl(status: RuntimeStateSnapshot): string | null {
  const login = typeof status.loginUrl === 'string' ? status.loginUrl.trim() : ''
  if (login) return login
  const lan = typeof status.lanAccessUrl === 'string' ? status.lanAccessUrl.trim() : ''
  if (lan) return lan
  return null
}

export async function enrichStatusWithLocalHttpProbe(
  status: RuntimeStateSnapshot,
): Promise<RuntimeStateSnapshot> {
  if (status.state !== 'executando') {
    return { ...status, localHttpReachable: null }
  }

  const canonical = pickCanonicalUrl(status)
  if (!canonical) {
    return { ...status, localHttpReachable: null }
  }

  const probeUrl = deriveLocalProbeUrlFromCanonical(canonical, status.port)
  if (!probeUrl) {
    return { ...status, localHttpReachable: null }
  }

  const result = await probeLocalHttpUrl(probeUrl)

  if (result.ok && result.responded) {
    return {
      ...status,
      localHttpReachable: true,
      localHttpStatus: result.status,
      localHttpProbeUrl: probeUrl,
    }
  }

  if (!result.ok && !result.responded) {
    return {
      ...status,
      localHttpReachable: false,
      localHttpProbeUrl: probeUrl,
    }
  }

  return { ...status, localHttpReachable: null }
}
