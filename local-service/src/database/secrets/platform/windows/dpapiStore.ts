import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getSystemRoot } from '../../../../installation/paths.ts'
import type { SecureCredentialStore } from '../../secureCredentialStore.ts'

const execFileAsync = promisify(execFile)

function secretPath(systemId: string, key: string): string {
  const safeKey = key.replace(/[^a-z0-9:_-]/gi, '_')
  return path.join(getSystemRoot(systemId), 'secrets', `${safeKey}.dpapi`)
}

async function runDpapi(action: 'protect' | 'unprotect', payload: string): Promise<string> {
  const script =
    action === 'protect'
      ? `
Add-Type -AssemblyName System.Security
$plain = [Convert]::FromBase64String('${payload}')
$protected = [System.Security.Cryptography.ProtectedData]::Protect($plain, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($protected)
`
      : `
Add-Type -AssemblyName System.Security
$protected = [Convert]::FromBase64String('${payload}')
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($plain)
`

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024 },
  )

  return stdout.trim()
}

export function createWindowsDpapiStore(systemId: string): SecureCredentialStore {
  return {
    async store(key, secret) {
      try {
        const plainB64 = Buffer.from(secret, 'utf8').toString('base64')
        const protectedB64 = await runDpapi('protect', plainB64)
        const filePath = secretPath(systemId, key)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, protectedB64, { encoding: 'utf8', mode: 0o600 })
        return true
      } catch {
        return false
      }
    },

    async load(key) {
      try {
        const filePath = secretPath(systemId, key)
        const protectedB64 = (await fs.readFile(filePath, 'utf8')).trim()
        const plainB64 = await runDpapi('unprotect', protectedB64)
        return Buffer.from(plainB64, 'base64').toString('utf8')
      } catch {
        return null
      }
    },

    async delete(key) {
      try {
        await fs.rm(secretPath(systemId, key), { force: true })
      } catch {
        // ignore
      }
    },
  }
}
