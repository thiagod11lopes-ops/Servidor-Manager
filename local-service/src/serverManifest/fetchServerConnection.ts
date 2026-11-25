import { getPhysicalLanIPv4, getPrimaryLanIPv4, isCarrierGradeNatIPv4 } from '../config/networkAccess.ts'
import { sanitizePublicLoginUrl } from '../config/lanPublicUrl.ts'
import type { SystemAccessMode } from '../config/systemAccessMode.ts'
import { resolveInstallAccessHostForLanMode, resolveInstallAccessHostForLocalMode } from './resolveInstallAccessHost.ts'
import { resolveServidorEnvPaths } from './prepareServidorEnv.ts'
import type { ServerManifest } from './types.ts'
import fs from 'node:fs/promises'

function readEnvValue(content: string, key: string): string | null {
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(content)
  return match ? match[1].trim() : null
}

export type ServerConnectionPayload = {
  loginUrl?: string
  publicOrigin?: string
  mode?: string
  [key: string]: unknown
}

export async function resolveLanHttpOrigin(input: {
  rootDirectory: string
  manifest: ServerManifest
  httpPort: number
}): Promise<{ origin: string; hostUsed: string } | { error: string }> {
  const paths = resolveServidorEnvPaths(input.rootDirectory, input.manifest)
  let lanHost = 'auto'
  let accessMode: SystemAccessMode | undefined
  try {
    const raw = await fs.readFile(paths.envPath, 'utf8')
    lanHost = readEnvValue(raw, 'ACOMOPMS_LAN_HOST') ?? 'auto'
    const modeRaw = readEnvValue(raw, 'ACOMOPMS_ACCESS_MODE')
    if (modeRaw === 'local' || modeRaw === 'lan') accessMode = modeRaw
  } catch {
    // use auto
  }

  const lanHostTrimmed = lanHost.trim()
  const legacyVpnHost =
    lanHostTrimmed !== 'auto' &&
    (isCarrierGradeNatIPv4(lanHostTrimmed) || lanHostTrimmed.toLowerCase().endsWith('.ts.net'))

  let hostUsed = lanHostTrimmed
  if (lanHostTrimmed === 'auto' || legacyVpnHost) {
    if (accessMode === 'local') {
      hostUsed = resolveInstallAccessHostForLocalMode().host
    } else {
      const detected = getPhysicalLanIPv4() ?? getPrimaryLanIPv4()
      if (detected && !isCarrierGradeNatIPv4(detected)) {
        hostUsed = detected
      } else {
        const lanResolved = resolveInstallAccessHostForLanMode()
        if (!lanResolved.ok) {
          return { error: lanResolved.message }
        }
        hostUsed = lanResolved.host
      }
    }
  } else if (lanHostTrimmed === 'localhost') {
    hostUsed = '127.0.0.1'
  }

  return { origin: `http://${hostUsed}:${input.httpPort}`, hostUsed }
}

export async function fetchServerConnectionJson(
  origin: string,
  httpPort: number,
): Promise<
  | { ok: true; payload: ServerConnectionPayload; loginUrl: string }
  | { ok: false; message: string }
> {
  const url = `${origin.replace(/\/+$/, '')}/server-connection.json`
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      return { ok: false, message: `GET ${url} → HTTP ${response.status}` }
    }
    const payload = (await response.json()) as ServerConnectionPayload
    const loginUrl =
      typeof payload.loginUrl === 'string' && payload.loginUrl.trim().length > 0
        ? payload.loginUrl.trim()
        : typeof payload.publicOrigin === 'string'
          ? `${payload.publicOrigin.replace(/\/+$/, '')}/login`
          : `${origin}/login`

    const sanitized = sanitizePublicLoginUrl(loginUrl, httpPort)
    return { ok: true, payload, loginUrl: sanitized ?? loginUrl }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : `Falha ao buscar ${url}`,
    }
  }
}
