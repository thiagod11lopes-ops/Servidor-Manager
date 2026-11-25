import {
  shouldSkipBrowserUploadDirectoryName,
  shouldSkipBrowserUploadPath,
} from '../../shared/browserUploadPathFilter.ts'

export type DirectoryWalkEntry = {
  relativePath: string
  file: File
}

export async function collectFilesFromDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  base = '',
): Promise<DirectoryWalkEntry[]> {
  const entries: DirectoryWalkEntry[] = []

  for await (const [name, entry] of handle.entries()) {
    const rel = base ? `${base}/${name}` : name
    if (entry.kind === 'directory') {
      if (shouldSkipBrowserUploadDirectoryName(name)) continue
      if (shouldSkipBrowserUploadPath(rel, 'directory')) continue
      entries.push(...(await collectFilesFromDirectoryHandle(entry, rel)))
      continue
    }
    if (entry.kind === 'file') {
      if (shouldSkipBrowserUploadPath(rel, 'file')) continue
      const file = await entry.getFile()
      entries.push({ relativePath: rel, file })
    }
  }

  return entries
}
