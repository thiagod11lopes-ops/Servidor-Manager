import fs from 'node:fs/promises'
import path from 'node:path'

export async function readLanBuildHttpPort(projectDirectory: string): Promise<number | null> {
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(projectDirectory, 'frontend', 'dist', 'lan-build.json'), 'utf8'),
    ) as { httpPort?: unknown }
    const port = raw.httpPort
    return typeof port === 'number' && port > 0 && port < 65536 ? port : null
  } catch {
    return null
  }
}
