import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Raiz do Servidor OMPS para dev localhost (payload + servidor-omps-product.json). */
export function resolveOmpsDevInstallRoot() {
  const candidates = [
    process.env.SERVIDOR_MANAGER_INSTALL_ROOT?.trim(),
    path.join(root, 'release', 'servidor-omps', 'win-unpacked'),
    'C:\\Program Files\\ServidorManager',
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'ServidorManager'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    const product = path.join(resolved, 'resources', 'servidor-omps-product.json')
    const payload = path.join(resolved, 'resources', 'omps-payload')
    if (fs.existsSync(product) && fs.existsSync(payload)) {
      return resolved
    }
  }
  return null
}

export function printOmpsDevInstallRootHint() {
  console.warn(
    '[dev:omps] Nenhuma instalação Servidor OMPS com payload encontrada.',
  )
  console.warn(
    '[dev:omps] Gere apenas a pasta de dev (sem instalador): npm run prepare:omps:dev',
  )
}
