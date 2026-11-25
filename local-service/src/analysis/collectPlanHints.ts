import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_FILE_BYTES = 256 * 1024

export type PlanHints = {
  configurationFiles: string[]
  environmentVariables: string[]
  identifiedPorts: number[]
}

async function readLimited(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

function parseEnvKeys(raw: string): string[] {
  const keys: string[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (/^[A-Z0-9_]+$/i.test(key)) keys.push(key)
  }
  return keys
}

function extractPortsFromText(text: string): number[] {
  const ports = new Set<number>()
  const patterns = [
    /port\s*[:=]\s*(\d{2,5})/gi,
    /:(\d{4,5})\b/g,
    /PORT\s*=\s*(\d{2,5})/gi,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1])
      if (value >= 1024 && value <= 65535) ports.add(value)
    }
  }

  return [...ports].slice(0, 6)
}

function defaultPortsForStack(input: {
  buildTool: string
  framework: string
  hasBackend: boolean
}): number[] {
  const ports = new Set<number>()
  if (input.buildTool.toLowerCase().includes('vite') || input.framework === 'React') {
    ports.add(4173)
    ports.add(5173)
  }
  if (input.framework === 'Next.js') ports.add(3000)
  if (input.hasBackend || input.framework === 'Express' || input.framework === 'Fastify') {
    ports.add(3000)
    ports.add(8080)
  }
  return [...ports]
}

export async function collectPlanHints(
  projectDir: string,
  stack: { buildTool: string; framework: string; hasBackend: boolean },
): Promise<PlanHints> {
  const configurationFiles: string[] = []
  const environmentVariables: string[] = []
  const identifiedPorts = new Set<number>(defaultPortsForStack(stack))

  const entries = await fs.readdir(projectDir)
  for (const name of entries) {
    if (/^vite\.config\.|^next\.config\.|^tsconfig\.json$|^package\.json$/.test(name)) {
      configurationFiles.push(name)
    }
    if (/^\.env(\..+)?$/i.test(name) && !name.includes('local')) {
      configurationFiles.push(name)
    }
  }

  const envExample = entries.find((name) => /^\.env\.example$/i.test(name))
  if (envExample) {
    const raw = await readLimited(path.join(projectDir, envExample))
    if (raw) {
      for (const key of parseEnvKeys(raw)) environmentVariables.push(key)
    }
  }

  for (const configName of entries.filter((name) => /^vite\.config\./.test(name))) {
    const raw = await readLimited(path.join(projectDir, configName))
    if (raw) {
      for (const port of extractPortsFromText(raw)) identifiedPorts.add(port)
    }
  }

  return {
    configurationFiles: [...new Set(configurationFiles)],
    environmentVariables: [...new Set(environmentVariables)],
    identifiedPorts: [...identifiedPorts],
  }
}

export function collectPlanHintsFromAnalysis(input: {
  directoryStructure: string[]
  buildTool: string
  framework: string
  hasBackend: boolean
}): PlanHints {
  const configurationFiles = input.directoryStructure
    .map((entry) => entry.replace(/\/$/, ''))
    .filter((name) =>
      /^(package\.json|tsconfig\.json|vite\.config\.|next\.config\.|\.env)/.test(name),
    )

  return {
    configurationFiles,
    environmentVariables: [],
    identifiedPorts: defaultPortsForStack(input),
  }
}
