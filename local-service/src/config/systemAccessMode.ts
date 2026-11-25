import fs from 'node:fs'
import path from 'node:path'
import { getSystemRoot } from '../installation/paths.ts'

/** `local` = neste computador; `lan` = outros dispositivos na mesma rede Wi‑Fi/Ethernet. */
export type SystemAccessMode = 'local' | 'lan'

export const SYSTEM_ACCESS_MODE_VERSION = 2

export type SystemAccessModeConfig = {
  mode: SystemAccessMode
  chosenAt: string
  version: typeof SYSTEM_ACCESS_MODE_VERSION
}

const CONFIG_FILE_NAME = 'access-mode.json'

export function getSystemAccessModeConfigPath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'config', CONFIG_FILE_NAME)
}

export function parseSystemAccessMode(value: unknown): SystemAccessMode | null {
  if (value === 'local' || value === 'lan') return value
  return null
}

function migrateLegacyMode(rawMode: unknown): SystemAccessMode | null {
  if (rawMode === 'internet') return null
  if (rawMode === 'local') return 'lan'
  return parseSystemAccessMode(rawMode)
}

export function readSystemAccessModeConfig(systemId: string): SystemAccessModeConfig | null {
  const configPath = getSystemAccessModeConfigPath(systemId)
  try {
    if (!fs.existsSync(configPath)) return null
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<SystemAccessModeConfig> & {
      version?: number
    }
    const mode =
      parsed.version === SYSTEM_ACCESS_MODE_VERSION
        ? parseSystemAccessMode(parsed.mode)
        : migrateLegacyMode(parsed.mode)
    if (!mode) return null
    if (typeof parsed.chosenAt !== 'string' || !parsed.chosenAt.trim()) return null
    return {
      mode,
      chosenAt: parsed.chosenAt,
      version: SYSTEM_ACCESS_MODE_VERSION,
    }
  } catch {
    return null
  }
}

export function writeSystemAccessModeConfig(
  systemId: string,
  mode: SystemAccessMode,
): { ok: true; config: SystemAccessModeConfig } | { ok: false; message: string } {
  const configPath = getSystemAccessModeConfigPath(systemId)
  const configDir = path.dirname(configPath)

  const payload: SystemAccessModeConfig = {
    mode,
    chosenAt: new Date().toISOString(),
    version: SYSTEM_ACCESS_MODE_VERSION,
  }

  try {
    fs.mkdirSync(configDir, { recursive: true })
    const tempPath = `${configPath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8')
    fs.renameSync(tempPath, configPath)
    return { ok: true, config: payload }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: `Não foi possível salvar o modo de acesso em ${configPath}: ${detail}`,
    }
  }
}
