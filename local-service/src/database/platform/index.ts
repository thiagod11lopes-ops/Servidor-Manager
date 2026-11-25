import type { HostProbePlatform } from './hostProbe.ts'
import { probePostgreSqlWindows } from './windows/postgresProbe.ts'

const windowsProbe: HostProbePlatform = {
  probePostgreSql: probePostgreSqlWindows,
}

export function getHostProbePlatform(): HostProbePlatform {
  if (process.platform === 'win32') {
    return windowsProbe
  }

  throw new Error('UNSUPPORTED_PLATFORM')
}
