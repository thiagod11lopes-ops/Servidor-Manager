import type { RunInstallationOutcome } from './installationManager.ts'

const jobs = new Map<string, Promise<void>>()

export function isInstallationJobRunning(systemId: string): boolean {
  return jobs.has(systemId)
}

export function scheduleInstallationJob(
  systemId: string,
  run: () => Promise<RunInstallationOutcome | void>,
): { accepted: true } | { accepted: false; message: string } {
  if (jobs.has(systemId)) {
    return {
      accepted: false,
      message: 'Instalação já está em execução neste serviço local.',
    }
  }

  const job = (async () => {
    await run()
  })().finally(() => {
    jobs.delete(systemId)
  })

  jobs.set(systemId, job)
  return { accepted: true }
}
