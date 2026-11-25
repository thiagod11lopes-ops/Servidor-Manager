import { getWindowsServerInfo } from './windows/getServerInfo.ts'

export async function getServerInfo() {
  if (process.platform !== 'win32') {
    throw new Error('UNSUPPORTED_PLATFORM')
  }

  return getWindowsServerInfo()
}
