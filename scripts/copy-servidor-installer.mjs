/**
 * Copia release/servidor.exe para a raiz do projeto (distribuição manual).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'release', 'servidor.exe')
const dest = path.join(root, 'servidor.exe')

await fs.access(src)
await fs.copyFile(src, dest)
const stat = await fs.stat(dest)
console.log(`Instalador copiado: ${dest} (${Math.round(stat.size / 1024 / 1024)} MiB)`)
