import fs from 'node:fs/promises'
import { resolveServidorEnvPaths } from './prepareServidorEnv.ts'
import type { ServerManifest } from './types.ts'

/** Carrega chaves ACOMOPMS_* de servidor.env para execução de scripts do manifesto. */
export async function loadServidorEnvIntoProcessEnv(
  rootDirectory: string,
  manifest: ServerManifest,
): Promise<NodeJS.ProcessEnv> {
  const paths = resolveServidorEnvPaths(rootDirectory, manifest)
  let raw: string
  try {
    raw = await fs.readFile(paths.envPath, 'utf8')
  } catch {
    return { ...process.env }
  }

  const extra: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key.startsWith('ACOMOPMS_')) extra[key] = value
  }

  return { ...process.env, ...extra }
}
