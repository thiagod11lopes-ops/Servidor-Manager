const locks = new Map<string, Promise<void>>()

/** Evita `npm ci`/`install` concorrentes no mesmo diretório (Windows lock / corrupção). */
export async function withNpmDirectoryLock<T>(directory: string, task: () => Promise<T>): Promise<T> {
  const key = directory.toLowerCase()
  while (locks.has(key)) {
    await locks.get(key)
  }

  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  locks.set(key, gate)

  try {
    return await task()
  } finally {
    locks.delete(key)
    release()
  }
}
