export const LOCAL_FOLDER_SOURCE_PREFIX = 'local-folder:'

export function encodeLocalFolderSourceUrl(absolutePath: string): string {
  return `${LOCAL_FOLDER_SOURCE_PREFIX}${absolutePath}`
}

export function parseLocalFolderSourceUrl(sourceUrl: string): string | null {
  if (!sourceUrl.startsWith(LOCAL_FOLDER_SOURCE_PREFIX)) return null
  const raw = sourceUrl.slice(LOCAL_FOLDER_SOURCE_PREFIX.length).trim()
  return raw.length > 0 ? raw : null
}

export function isLocalFolderSourceUrl(sourceUrl: string): boolean {
  return parseLocalFolderSourceUrl(sourceUrl) !== null
}
