import fs from 'node:fs/promises'
import path from 'node:path'

import { getManagerLogsDir } from './managerDataRoot.ts'

export async function appendInstallationDiagnostic(input: {
  systemId: string
  phaseId?: string | null
  event: string
  detail?: string
  outputTail?: string
}): Promise<void> {
  const line = [
    new Date().toISOString(),
    input.event,
    input.phaseId ? `phase=${input.phaseId}` : null,
    input.detail ?? null,
    input.outputTail ? `output=${sanitizeTail(input.outputTail)}` : null,
  ]
    .filter(Boolean)
    .join(' | ')

  const logDir = getManagerLogsDir()
  await fs.mkdir(logDir, { recursive: true })
  const filePath = path.join(logDir, `install-${input.systemId}.log`)
  await fs.appendFile(filePath, `${line}\n`, 'utf8')
}

export async function appendLocalServiceDiagnostic(event: string, detail: string): Promise<void> {
  const line = `${new Date().toISOString()} | ${event} | ${detail}\n`
  const logDir = getManagerLogsDir()
  await fs.mkdir(logDir, { recursive: true })
  await fs.appendFile(path.join(logDir, 'local-service.log'), line, 'utf8')
}

function sanitizeTail(text: string): string {
  const trimmed = text.replace(/\r/g, '').trim()
  if (trimmed.length <= 2_000) return trimmed
  return `…${trimmed.slice(-2_000)}`
}
