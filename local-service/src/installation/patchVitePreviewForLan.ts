import fs from 'node:fs/promises'
import path from 'node:path'

/** Garante preview acessível por IP/hostname na LAN (allowedHosts). */
export async function patchVitePreviewForLan(projectDir: string): Promise<boolean> {
  const configPath = path.join(projectDir, 'vite.config.ts')
  let raw: string
  try {
    raw = await fs.readFile(configPath, 'utf8')
  } catch {
    return false
  }

  if (raw.includes('allowedHosts')) return false

  const snippet = `
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },`

  if (raw.includes('preview:')) {
    if (!raw.includes('allowedHosts')) {
      raw = raw.replace(/preview:\s*\{/, `preview: {\n    allowedHosts: true,`)
    }
  } else if (raw.includes('export default defineConfig({')) {
    raw = raw.replace(
      'export default defineConfig({',
      `export default defineConfig({${snippet}`,
    )
  } else {
    return false
  }

  await fs.writeFile(configPath, raw, 'utf8')
  return true
}
