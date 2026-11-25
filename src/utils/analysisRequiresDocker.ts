import type { SystemAnalysisResult } from '../types/systemAnalysis.ts'

/** Sistemas sem manifesto Docker (ex.: preview Vite legado) não passam pelo gate. */
export function analysisRequiresDocker(analysis: SystemAnalysisResult | undefined): boolean {
  if (!analysis?.serverManifest) return false
  const manifest = analysis.serverManifest
  if (manifest.backendProfile === 'supabase-local-v1') return true
  if (manifest.requiredTools?.some((tool) => tool.toLowerCase() === 'docker')) return true
  return false
}
