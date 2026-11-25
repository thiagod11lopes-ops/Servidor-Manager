import fs from 'node:fs/promises'
import { readSystemAccessModeConfig } from '../config/systemAccessMode.ts'
import { isCarrierGradeNatIPv4 } from '../config/networkAccess.ts'
import { resolveInstallAccessHostForLanMode } from './resolveInstallAccessHost.ts'
import { prepareServidorEnv, resolveServidorEnvPaths } from './prepareServidorEnv.ts'
import type { ServerManifest } from './types.ts'

function readEnvValue(content: string, key: string): string | null {
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(content)
  return match ? match[1].trim() : null
}

/**
 * Corrige ACOMOPMS_LAN_HOST legado (CGNAT/VPN) no disco sem tocar na base de dados.
 */
export async function ensureServidorEnvLanHostCoherent(input: {
  systemId: string
  rootDirectory: string
  manifest: ServerManifest
  httpPort: number
}): Promise<{ healed: boolean; message?: string }> {
  const mode = readSystemAccessModeConfig(input.systemId)?.mode
  if (mode !== 'lan') return { healed: false }

  const paths = resolveServidorEnvPaths(input.rootDirectory, input.manifest)
  let content: string
  try {
    content = await fs.readFile(paths.envPath, 'utf8')
  } catch {
    return { healed: false }
  }

  const lanHost = readEnvValue(content, 'ACOMOPMS_LAN_HOST')
  if (!lanHost || lanHost === 'auto') return { healed: false }

  const legacyVpn =
    isCarrierGradeNatIPv4(lanHost) || lanHost.toLowerCase().endsWith('.ts.net')
  if (!legacyVpn) return { healed: false }

  const resolved = resolveInstallAccessHostForLanMode()
  if (!resolved.ok) {
    return { healed: false, message: resolved.message }
  }

  const result = await prepareServidorEnv({
    rootDirectory: input.rootDirectory,
    manifest: input.manifest,
    accessMode: 'lan',
    lanHost: resolved.host,
    httpPort: input.httpPort,
  })

  if (!result.ok) {
    return { healed: false, message: result.message }
  }

  return {
    healed: true,
    message: `ACOMOPMS_LAN_HOST atualizado de ${lanHost} para ${resolved.host} (IPv4 LAN físico).`,
  }
}
