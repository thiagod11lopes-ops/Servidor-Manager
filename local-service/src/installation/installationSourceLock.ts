const chains = new Map<string, Promise<void>>()

function compositeKey(sourceKeys: string[]): string {
  return [...sourceKeys].sort().join('|')
}

export async function withInstallationSourceLock<T>(
  sourceKeys: string[],
  run: () => Promise<T>,
): Promise<T> {
  if (sourceKeys.length === 0) {
    return run()
  }

  const key = compositeKey(sourceKeys)
  const previous = chains.get(key) ?? Promise.resolve()

  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  const tail = previous.then(() => gate)
  chains.set(key, tail)

  await previous
  try {
    return await run()
  } finally {
    release()
    if (chains.get(key) === tail) {
      chains.delete(key)
    }
  }
}

/** Apenas para testes — não usar em produção. */
export function resetInstallationSourceLocksForTests(): void {
  chains.clear()
}
