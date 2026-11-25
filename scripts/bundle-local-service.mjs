import esbuild from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outdir = path.join(root, 'dist-local-service')

await esbuild.build({
  entryPoints: [path.join(root, 'local-service/src/index.ts')],
  outfile: path.join(outdir, 'local-service.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
})

await esbuild.build({
  entryPoints: [path.join(root, 'local-service/src/entries/serviceHostEntry.ts')],
  outfile: path.join(outdir, 'service-host.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
})

await fs.copyFile(
  path.join(root, 'resources-packaging', 'servidor-omps-product.json'),
  path.join(outdir, 'servidor-omps-product.fallback.json'),
)

console.log('local-service bundle written to dist-local-service/')
