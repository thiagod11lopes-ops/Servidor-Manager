import fs from 'node:fs/promises'
import path from 'node:path'
import { getPrimaryLanIPv4, readNetworkAccessConfig } from '../config/networkAccess.ts'

export async function patchProjectEnvForLan(projectDir: string): Promise<string | null> {
  if (!readNetworkAccessConfig().allowLanAccess) return null

  const lanIp = getPrimaryLanIPv4()
  if (!lanIp) return null

  const envPath = path.join(projectDir, '.env')
  let raw: string
  try {
    raw = await fs.readFile(envPath, 'utf8')
  } catch {
    return null
  }

  let changed = false
  const lines = raw.split('\n').map((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return line
    const eq = line.indexOf('=')
    if (eq <= 0) return line
    const key = line.slice(0, eq).trim()
    if (!key.startsWith('VITE_')) return line

    let value = line.slice(eq + 1).trim()
    const next = value
      .replace(/\/\/127\.0\.0\.1/g, `//${lanIp}`)
      .replace(/\/\/localhost/g, `//${lanIp}`)
      .replace(/^127\.0\.0\.1(?=[:/]|$)/, lanIp)
      .replace(/^localhost(?=[:/]|$)/, lanIp)

    if (next !== value) {
      changed = true
      value = next
    }
    return `${key}=${value}`
  })

  if (!changed) return null

  await fs.writeFile(envPath, lines.join('\n'), 'utf8')
  return lanIp
}
