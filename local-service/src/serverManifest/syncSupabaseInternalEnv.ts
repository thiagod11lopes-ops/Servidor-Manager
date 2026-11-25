import fs from 'node:fs/promises'
import type { ServerManifest } from './types.ts'
import { resolveServidorEnvPaths, setEnvLine } from './prepareServidorEnv.ts'

export async function syncSupabaseInternalUrlInServidorEnv(
  rootDirectory: string,
  apiPort: number,
  manifest?: ServerManifest,
): Promise<void> {
  const paths = manifest
    ? resolveServidorEnvPaths(rootDirectory, manifest)
    : resolveServidorEnvPaths(rootDirectory, {
        configuration: { singleSourceOfTruthRelativePath: 'Transferir para Servidor/servidor-lan/servidor.env' },
      } as ServerManifest)

  let content: string
  try {
    content = await fs.readFile(paths.envPath, 'utf8')
  } catch {
    return
  }

  const url = `http://127.0.0.1:${apiPort}`
  const next = setEnvLine(content, 'ACOMOPMS_SUPABASE_INTERNAL', url)
  if (next === content) return
  await fs.writeFile(paths.envPath, next, 'utf8')
}
