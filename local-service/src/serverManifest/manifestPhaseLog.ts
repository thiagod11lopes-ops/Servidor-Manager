import fs from 'node:fs/promises'
import path from 'node:path'
import { getLogsDirectory } from '../runtime/runtimePaths.ts'
import { redactSupabaseCliOutput } from './redactSupabaseCliOutput.ts'

export async function appendManifestPhaseLog(
  systemId: string,
  phaseId: string,
  chunk: string,
): Promise<void> {
  const dir = getLogsDirectory(systemId)
  await fs.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString()
  const line = `[${stamp}] ${chunk}\n`
  await fs.appendFile(path.join(dir, 'manifest-install.log'), line, 'utf8')
  await fs.appendFile(path.join(dir, `phase-${phaseId}.log`), line, 'utf8')
}

export async function writeManifestPhaseOutput(
  systemId: string,
  phaseId: string,
  output: string,
): Promise<void> {
  if (!output.trim()) return
  const dir = getLogsDirectory(systemId)
  await fs.mkdir(dir, { recursive: true })
  const safe = redactSupabaseCliOutput(output).slice(0, 500_000)
  await fs.appendFile(path.join(dir, `phase-${phaseId}.log`), `\n--- output ---\n${safe}\n`, 'utf8')
}
