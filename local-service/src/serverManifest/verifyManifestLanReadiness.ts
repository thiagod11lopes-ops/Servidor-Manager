import { probeLocalHttpUrl } from '../network/probeLocalHttpUrl.ts'
import { isAllowedOmpsHttpPort, type ServidorOmpsLanAccess } from '../products/servidorOmpsProductConfig.ts'
import {
  verifyFixedLanProductReadiness,
  type FixedLanReadinessDeps,
} from './verifyFixedLanProductReadiness.ts'

export type LanReadinessCheck = { id: string; ok: boolean; detail: string }

export type LanReadinessResult =
  | { ok: true; checks: LanReadinessCheck[]; message: string }
  | { ok: false; checks: LanReadinessCheck[]; message: string }

const KONG_HEALTH_URL = 'http://127.0.0.1:54321/auth/v1/health'

/**
 * Prontidão mínima pós-proxy: Kong loopback, UI/login via Caddy e descriptor público.
 * Não substitui test-server-lan/verify-lan-security, mas evita sucesso prematuro.
 */
export async function verifyManifestLanReadiness(
  httpPort: number,
  probe: typeof probeLocalHttpUrl = probeLocalHttpUrl,
  options?: {
    fixedLan?: ServidorOmpsLanAccess
    fixedLanDeps?: FixedLanReadinessDeps
    resolvedLanHost?: string
  },
): Promise<LanReadinessResult> {
  if (options?.fixedLan) {
    if (!isAllowedOmpsHttpPort(options.fixedLan, httpPort)) {
      return {
        ok: false,
        checks: [
          {
            id: 'fixed.port.contract',
            ok: false,
            detail: `Porta efetiva ${httpPort} fora da faixa permitida pelo produto (base ${options.fixedLan.requiredHttpPort}).`,
          },
        ],
        message: `Prontidão LAN reprovada: porta ${httpPort} não é permitida pelo contrato OMPS.`,
      }
    }
    return verifyFixedLanProductReadiness(
      options.fixedLan,
      options.fixedLanDeps,
      options.resolvedLanHost,
      httpPort,
    )
  }

  const checks: LanReadinessCheck[] = []

  const kong = await probe(KONG_HEALTH_URL, { timeoutMs: 6_000 })
  checks.push({
    id: 'supabase.kong.loopback',
    ok: kong.ok && kong.responded,
    detail: kong.ok ? `HTTP ${kong.status}` : kong.message,
  })

  const login = await probe(`http://127.0.0.1:${httpPort}/login`, { timeoutMs: 8_000 })
  checks.push({
    id: 'caddy.login',
    ok: login.ok && login.responded && login.status >= 200 && login.status < 500,
    detail: login.ok ? `HTTP ${login.status}` : login.message,
  })

  const connection = await probe(`http://127.0.0.1:${httpPort}/server-connection.json`, {
    timeoutMs: 8_000,
  })
  checks.push({
    id: 'caddy.server-connection',
    ok: connection.ok && connection.responded && connection.status >= 200 && connection.status < 500,
    detail: connection.ok ? `HTTP ${connection.status}` : connection.message,
  })

  const failed = checks.filter((c) => !c.ok)
  if (failed.length > 0) {
    return {
      ok: false,
      checks,
      message: `Prontidão LAN incompleta (${failed.map((f) => f.id).join(', ')}). ${failed[0]?.detail ?? ''}`.trim(),
    }
  }

  return {
    ok: true,
    checks,
    message: `Prontidão LAN OK na porta ${httpPort} (Kong, /login, server-connection.json).`,
  }
}
