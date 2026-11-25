import type { SystemAnalysisResponse, SystemAnalysisResult } from '../types/systemAnalysis.ts'

function parseSourceUrl(sourceUrl: string): URL | null {
  try {
    const url = new URL(sourceUrl.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

function projectNameFromUrl(url: URL): string {
  const segment = url.pathname.split('/').filter(Boolean).pop()
  if (!segment) return 'Projeto'
  return decodeURIComponent(segment)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function mockAnalyzeSystem(sourceUrl: string): Promise<SystemAnalysisResponse> {
  const url = parseSourceUrl(sourceUrl)
  if (!url) {
    return {
      ok: false,
      message: 'Informe uma URL válida com http:// ou https:// para analisar.',
    }
  }

  await delay(700)

  const projectName = projectNameFromUrl(url)

  const result: SystemAnalysisResult = {
    source: 'mock',
    mock: true,
    sourceUrl: url.toString(),
    projectName,
    primaryLanguage: 'TypeScript',
    projectType: 'Aplicação Web',
    technologies: ['JavaScript', 'TypeScript', 'HTML', 'CSS'],
    hasPackageJson: true,
    framework: 'React',
    buildTool: 'Vite',
    packageManager: 'npm',
    hasFrontend: true,
    hasBackend: false,
    backendRequired: false,
    backendDetail: 'Não identificado',
    databaseRequired: false,
    databaseDetail: 'Não identificado',
    dependencies: ['react', 'vite'],
    installCommands: ['npm install'],
    buildCommands: ['npm run build'],
    devCommands: ['npm run dev'],
    runCommands: ['npm run dev', 'npm run build'],
    directoryStructure: ['src/', 'public/', 'package.json'],
    analyzedAt: new Date().toISOString(),
    disclaimer: 'Resultado simulado (MOCK). Serviço local indisponível.',
  }

  return { ok: true, result }
}
