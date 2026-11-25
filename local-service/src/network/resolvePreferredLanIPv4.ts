import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import {
  isRfc1918IPv4,
  listPhysicalLanIPv4Candidates,
  selectPhysicalLanIPv4,
  type PhysicalLanIPv4Selection,
} from '../config/networkAccess.ts'

const execFileAsync = promisify(execFile)

async function readDefaultRouteLocalIpv4Windows(): Promise<string | null> {
  try {
    const ps = [
      '$r = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |',
      'Sort-Object -Property RouteMetric | Select-Object -First 1;',
      'if (-not $r) { exit 2 };',
      '$ifIndex = $r.InterfaceIndex;',
      '$addr = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue |',
      'Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |',
      'Select-Object -First 1 -ExpandProperty IPAddress;',
      'if ($addr) { Write-Output $addr }',
    ].join(' ')
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 8_000,
      windowsHide: true,
    })
    const ip = stdout.trim().split(/\r?\n/).pop()?.trim()
    if (ip && isRfc1918IPv4(ip)) return ip
    return ip && !ip.startsWith('127.') ? ip : null
  } catch {
    return null
  }
}

async function readDefaultRouteLocalIpv4Linux(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ip', ['route', 'show', 'default'], { timeout: 4_000 })
    const devMatch = /\bdev\s+(\S+)/.exec(stdout)
    if (!devMatch) return null
    const iface = devMatch[1]
    const nets = os.networkInterfaces()[iface]
    if (!nets) return null
    for (const entry of nets) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      if (entry.address.startsWith('169.254.')) continue
      return entry.address
    }
    return null
  } catch {
    return null
  }
}

export type PreferredLanIPv4Result = PhysicalLanIPv4Selection & {
  source: 'default-route' | 'physical-selection' | 'none'
}

/** IPv4 LAN preferido: rota padrão quando detectável, senão heurística física/RFC1918. */
export async function resolvePreferredLanIPv4(): Promise<PreferredLanIPv4Result> {
  const routed =
    process.platform === 'win32'
      ? await readDefaultRouteLocalIpv4Windows()
      : process.platform === 'linux'
        ? await readDefaultRouteLocalIpv4Linux()
        : null

  if (routed) {
    const candidates = listPhysicalLanIPv4Candidates()
    const match = candidates.find((c) => c.address === routed)
    if (match) {
      return {
        address: routed,
        candidates,
        ambiguous: false,
        note: `IPv4 ${routed} na interface ${match.interfaceName} (rota padrão).`,
        source: 'default-route',
      }
    }
  }

  const fallback = selectPhysicalLanIPv4()
  return { ...fallback, source: fallback.address ? 'physical-selection' : 'none' }
}

export async function resolvePreferredLanHostOrAuto(): Promise<
  { ok: true; host: string; note?: string; ambiguous: boolean } | { ok: false; message: string }
> {
  const sel = await resolvePreferredLanIPv4()
  if (!sel.address) {
    return {
      ok: false,
      message:
        sel.note ??
        'Nenhuma interface IPv4 adequada para anunciar o Servidor OMPS na LAN. Conecte Wi‑Fi/Ethernet ou defina ACOMOPMS_LAN_HOST.',
    }
  }
  return { ok: true, host: sel.address, note: sel.note, ambiguous: sel.ambiguous }
}
