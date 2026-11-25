import { inspectProjectSource } from './inspectProjectSource.ts'
import { isGitHubPagesSiteUrl } from '../sources/validateSourceUrl.ts'

function errorMessage(code: string, sourceUrl: string): string {
  switch (code) {
    case 'INVALID_SOURCE_URL':
      return 'Informe uma URL pública válida (http:// ou https://) apontando para um repositório Git.'
    case 'GITHUB_PAGES_URL':
      return 'Esta URL é do site publicado (GitHub Pages), não do código-fonte. Use o link do repositório, por exemplo: https://github.com/usuario/projeto'
    case 'GIT_NOT_AVAILABLE':
      return 'Git não está disponível neste computador. Instale o Git para analisar repositórios.'
    case 'GIT_CLONE_FAILED':
      if (isGitHubPagesSiteUrl(sourceUrl)) {
        return 'Não foi possível clonar a partir desta URL do GitHub Pages. Em Configurar, use https://github.com/usuario/repositorio ou instale o Git.'
      }
      return 'Não foi possível obter uma cópia temporária do repositório. Verifique a URL, se o repositório é público e se o Git está instalado.'
    default:
      if (code.startsWith('DOCKER_NOT_READY:')) {
        const parts = code.split(':')
        const reason = parts.slice(2).join(':') || 'Docker indisponível.'
        if (parts[1] === 'not_installed') {
          return reason
        }
        return reason
      }
      return 'Não foi possível analisar o projeto neste momento.'
  }
}

export async function analyzeProjectFromUrl(sourceUrl: string) {
  try {
    const { result } = await inspectProjectSource(sourceUrl)
    return { ok: true as const, result }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    return { ok: false as const, message: errorMessage(code, sourceUrl) }
  }
}
