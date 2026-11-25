import type { DatabaseHostStatus } from '../types/databaseTypes.ts'

export type HostProbePlatform = {
  probePostgreSql(): Promise<DatabaseHostStatus['postgresql']>
}
