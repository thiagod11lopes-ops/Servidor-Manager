export type CapacityState = 'normal' | 'attention' | 'critical' | 'severe' | 'unknown'

export type MetricAvailability = 'measured' | 'estimated' | 'unavailable'

export type VolumeStorageSnapshot = {
  path: string
  label: string
  totalBytes: number | null
  availableBytes: number | null
  usedBytes: number | null
  usedPercent: number | null
  capacityState: CapacityState
  availability: MetricAvailability
  detail: string | null
  collectedAt: string
}

export type LiveMetricsSnapshot = {
  collectedAt: string
  cpuUsagePercent: number | null
  cpuDetail: string | null
  memoryUsedPercent: number | null
  memoryUsedBytes: number | null
  memoryTotalBytes: number | null
  memoryDetail: string | null
  networkBytesInPerSec: number | null
  networkBytesOutPerSec: number | null
  networkDetail: string | null
  volumes: VolumeStorageSnapshot[]
  collectionError: string | null
}

export type HistorySample = {
  t: string
  cpu: number | null
  mem: number | null
  netIn: number | null
  netOut: number | null
  diskUsedPercent: number | null
  diskPath: string | null
}

export type StorageSizeField = {
  bytes: number | null
  label: string | null
  availability: MetricAvailability
  detail: string | null
  measuredAt: string | null
}

export type SystemStorageRow = {
  systemId: string
  displayName: string | null
  serverManifestProfile: string | null
  runtimeState: string | null
  projectFiles: StorageSizeField
  persistentData: StorageSizeField
  database: StorageSizeField
  userUploads: StorageSizeField
  backups: StorageSizeField
  logs: StorageSizeField
  totalMeasured: StorageSizeField
  limitations: string[]
}

export type MonitoringAlert = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  volumePath: string | null
  systemId: string | null
  active: boolean
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
}

export type MonitoringSettings = {
  attentionUsedPercent: number
  criticalUsedPercent: number
  severeUsedPercent: number
  minFreeBytesWarning: number | null
}

export type AuthUserRow = {
  id: string
  email: string | null
  createdAt: string | null
  lastSignInAt: string | null
  banned: boolean | null
  disabled: boolean | null
}

export type AuthUsersPage = {
  ok: boolean
  message: string | null
  users: AuthUserRow[]
  total: number | null
  page: number
  pageSize: number
  capabilities: {
    list: boolean
    disable: boolean
    delete: boolean
  }
}

export type OperationalHealthLevel =
  | 'operational'
  | 'attention'
  | 'degraded'
  | 'unavailable'
  | 'checking'

export type DashboardOperationalDetailStatus = 'ok' | 'warn' | 'fail' | 'skip'

export type DashboardOperationalDetail = {
  id: string
  label: string
  status: DashboardOperationalDetailStatus
  message: string
  solutions?: string[]
}

export type DashboardOperationalStatus = {
  level: OperationalHealthLevel
  label: string
  summary: string
  details: DashboardOperationalDetail[]
}

export type OnlineUsersPerSystem = {
  systemId: string
  databaseNumber: string | null
  count: number | null
  detail: string | null
}

export type OnlineUserEntry = {
  userId: string
  email: string | null
  displayName: string | null
  systemId: string
  systemLabel: string | null
  databaseNumber: string | null
  lastActivityAt: string | null
}

export type OnlineUsersOverview = {
  collectedAt: string
  count: number | null
  detail: string
  perSystem: OnlineUsersPerSystem[]
  users: OnlineUserEntry[]
}

export type DashboardOverviewResponse = {
  ok: boolean
  onlineUsers: OnlineUsersOverview
  operational: DashboardOperationalStatus
}

export type AcompStorageDetail = {
  systemId: string
  profile: string | null
  categories: Array<{ id: string; title: string; field: StorageSizeField }>
  totalIdentified: StorageSizeField
  notes: string[]
}
