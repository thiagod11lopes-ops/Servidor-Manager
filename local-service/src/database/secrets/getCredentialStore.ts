import type { SecureCredentialStore } from './secureCredentialStore.ts'
import { createWindowsDpapiStore } from './platform/windows/dpapiStore.ts'

class NoopCredentialStore implements SecureCredentialStore {
  async store(): Promise<boolean> {
    return false
  }

  async load(): Promise<string | null> {
    return null
  }

  async delete(): Promise<void> {
    // noop
  }
}

export function getCredentialStoreForSystem(systemId: string): SecureCredentialStore {
  if (process.platform === 'win32') {
    return createWindowsDpapiStore(systemId)
  }
  return new NoopCredentialStore()
}
