import fs from 'node:fs/promises'
import path from 'node:path'
import { getCredentialStoreForSystem } from '../../database/secrets/getCredentialStore.ts'
import { readDatabaseProfile } from '../../database/profileStore.ts'
import { getSystemRoot } from '../../installation/paths.ts'

const SECRET_KEYS = new Set(['DATABASE_PASSWORD', 'POSTGRES_PASSWORD', 'PGPASSWORD'])

export async function buildApplicationEnv(systemId: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {}

  const configPath = path.join(getSystemRoot(systemId), 'config', 'database.env')
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (SECRET_KEYS.has(key)) continue
      if (/^[A-Z0-9_]+$/i.test(key)) env[key] = value
    }
  } catch {
    // no database env file
  }

  const profile = await readDatabaseProfile(systemId)
  const credentialKey = profile?.provisioning?.credentialKey
  if (credentialKey) {
    const store = getCredentialStoreForSystem(systemId)
    const password = await store.load(credentialKey)
    if (password) {
      env.DATABASE_PASSWORD = password
      env.PGPASSWORD = password
    }
  }

  return env
}
