export type CursorUpdateEntry = {
  version: string
  updatedAt: string
  title: string
  changes: string[]
}

export type CursorUpdatesManifest = {
  currentVersion: string
  lastBuiltAt: string | null
  entries: CursorUpdateEntry[]
}
