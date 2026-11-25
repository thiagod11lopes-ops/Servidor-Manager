import fs from 'node:fs/promises'
import { getSystemRoot } from '../installation/paths.ts'
import type { RuntimeStateSnapshot } from './types.ts'
import { getRuntimeStatePath } from './runtimePaths.ts'

export async function readRuntimeState(systemId: string): Promise<RuntimeStateSnapshot | null> {
  try {
    const raw = await fs.readFile(getRuntimeStatePath(systemId), 'utf8')
    return JSON.parse(raw) as RuntimeStateSnapshot
  } catch {
    return null
  }
}

export async function writeRuntimeState(state: RuntimeStateSnapshot): Promise<void> {
  await fs.mkdir(getSystemRoot(state.systemId), { recursive: true })
  await fs.writeFile(getRuntimeStatePath(state.systemId), JSON.stringify(state, null, 2), 'utf8')
}
