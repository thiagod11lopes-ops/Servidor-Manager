import fs from 'node:fs/promises'
import path from 'node:path'
import type { SystemAccessMode } from '../config/systemAccessMode.ts'
import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'
import { getSystemRoot } from './paths.ts'

export const DOCKER_INSTALL_PAUSE_MESSAGE = 'DOCKER NECESSÁRIO, INICIE DOCKER PARA CONTINUAR'

export type InstallDockerPauseCheckpoint = {
  version: 1
  reason: 'docker'
  savedAt: string
  systemId: string
  sourceUrl: string
  plan: InstallationPlanPayload
  accessMode?: SystemAccessMode
  lanHost?: string
  overlayEnabled?: boolean
}

export function getInstallDockerPausePath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'install-docker-pause.json')
}

export async function writeInstallDockerPause(checkpoint: InstallDockerPauseCheckpoint): Promise<void> {
  const filePath = getInstallDockerPausePath(checkpoint.systemId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf8')
}

export async function readInstallDockerPause(
  systemId: string,
): Promise<InstallDockerPauseCheckpoint | null> {
  try {
    const raw = await fs.readFile(getInstallDockerPausePath(systemId), 'utf8')
    const parsed = JSON.parse(raw) as InstallDockerPauseCheckpoint
    if (parsed?.version !== 1 || parsed.reason !== 'docker' || parsed.systemId !== systemId) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function clearInstallDockerPause(systemId: string): Promise<void> {
  try {
    await fs.unlink(getInstallDockerPausePath(systemId))
  } catch {
    // ignore
  }
}
