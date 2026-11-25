import type { ProcessPlatform } from './processPlatform.ts'
import { windowsProcessPlatform } from './windows/processPlatform.ts'

export function getProcessPlatform(): ProcessPlatform {
  if (process.platform === 'win32') {
    return windowsProcessPlatform
  }

  throw new Error('UNSUPPORTED_PLATFORM')
}
