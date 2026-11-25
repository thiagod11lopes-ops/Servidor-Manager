import type { SystemAccessMode } from '../config/systemAccessMode.ts'
import type { PrepareServidorEnvInput } from './prepareServidorEnv.ts'
import {
  resolveInstallAccessHostForLanMode,
  resolveInstallAccessHostForLocalMode,
} from './resolveInstallAccessHost.ts'

export function readServidorEnvField(content: string, key: string): string | null {
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(content)
  return match ? match[1].trim() : null
}

export function parseExistingHttpPort(content: string | null): number | null {
  if (!content) return null
  const raw = readServidorEnvField(content, 'ACOMOPMS_HTTP_PORT')
  if (!raw) return null
  const port = Number.parseInt(raw, 10)
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) return null
  return port
}

export type UpdatePrepareServidorEnvResult =
  | {
      ok: true
      input: Pick<PrepareServidorEnvInput, 'lanHost' | 'httpPort' | 'accessMode' | 'overlayEnabled'>
    }
  | { ok: false; message: string }

export async function buildUpdatePrepareServidorEnvInput(input: {
  accessMode: SystemAccessMode | null
  existingEnvContent: string | null
  manifestHttpPort: number
}): Promise<UpdatePrepareServidorEnvResult> {
  const httpPortFromFile = parseExistingHttpPort(input.existingEnvContent)
  const httpPort = httpPortFromFile ?? input.manifestHttpPort

  if (input.accessMode === 'local') {
    const resolved = resolveInstallAccessHostForLocalMode()
    return {
      ok: true,
      input: {
        accessMode: 'local',
        lanHost: resolved.host,
        httpPort,
        overlayEnabled: false,
      },
    }
  }

  if (input.accessMode === 'lan') {
    const resolved = resolveInstallAccessHostForLanMode()
    if (!resolved.ok) {
      return { ok: false, message: `Atualização abortada (modo LAN): ${resolved.message}` }
    }
    return {
      ok: true,
      input: {
        accessMode: 'lan',
        lanHost: resolved.host,
        httpPort,
      },
    }
  }

  return {
    ok: true,
    input: { httpPort },
  }
}
