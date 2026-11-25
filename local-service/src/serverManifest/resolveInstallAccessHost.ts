import { getPhysicalLanIPv4, isCarrierGradeNatIPv4 } from '../config/networkAccess.ts'

export type ResolveInstallAccessHostResult =
  | { ok: true; host: string; source: 'loopback' | 'lan-ipv4' }
  | { ok: false; message: string }

/** Host para modo LAN (IPv4 físico Wi‑Fi/Ethernet). */
export function resolveInstallAccessHostForLanMode(): ResolveInstallAccessHostResult {
  const ip = getPhysicalLanIPv4()
  if (!ip) {
    return {
      ok: false,
      message:
        'Modo rede local — não foi possível detectar um IPv4 LAN (192.168.x / 10.x / 172.16–31). Verifique cabo/Wi‑Fi e desconecte VPNs virtuais se necessário.',
    }
  }
  return { ok: true, host: ip, source: 'lan-ipv4' }
}

/** Host para modo local (neste computador servidor). */
export function resolveInstallAccessHostForLocalMode(): ResolveInstallAccessHostResult {
  return { ok: true, host: '127.0.0.1', source: 'loopback' }
}

export function isPhysicalLanHostForLanMode(host: string): boolean {
  const trimmed = host.trim()
  if (!trimmed || trimmed === 'auto') return false
  if (trimmed === '127.0.0.1' || trimmed === 'localhost') return false
  if (trimmed.toLowerCase().endsWith('.ts.net')) return false
  if (isCarrierGradeNatIPv4(trimmed)) return false
  return true
}

export function isValidServidorEnvPublicHost(host: string): boolean {
  const trimmed = host.trim()
  if (!trimmed || trimmed === 'auto') return trimmed === 'auto'
  if (trimmed === 'localhost') return true
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)
}

/** @deprecated use isPhysicalLanHostForLanMode */
export function isPhysicalLanHostForLocalMode(host: string): boolean {
  return isPhysicalLanHostForLanMode(host)
}
