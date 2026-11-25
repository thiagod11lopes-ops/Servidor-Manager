import { isLocalFolderSourceUrl } from '../sources/localFolderSource.ts'
import {
  isGitHubPagesSiteUrl,
  normalizeGitRemoteUrl,
  validateSourceUrl,
} from '../sources/validateSourceUrl.ts'

function tailLines(text: string, maxLines = 12): string {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean)
  if (lines.length === 0) return ''
  return lines.slice(-maxLines).join('\n')
}

export function formatInstallFailureMessage(input: {
  sourceUrl: string
  stage: 'clone' | 'dependencies' | 'build'
  commandOutput?: string
}): string {
  const parts: string[] = []

  if (input.stage === 'build') {
    parts.push('Falha ao executar o build do projeto.')
  } else if (input.stage === 'dependencies') {
    parts.push('Falha ao instalar dependências do projeto.')
  } else if (isLocalFolderSourceUrl(input.sourceUrl)) {
    parts.push('Não foi possível copiar o projeto da pasta local selecionada.')
  } else {
    parts.push('Não foi possível obter o código-fonte.')
  }

  if (isGitHubPagesSiteUrl(input.sourceUrl)) {
    try {
      const gitUrl = normalizeGitRemoteUrl(validateSourceUrl(input.sourceUrl))
      parts.push(
        `A URL informada é do site (GitHub Pages). O Manager tentou clonar ${gitUrl}. Prefira cadastrar diretamente: ${gitUrl.replace(/\.git$/i, '')}`,
      )
    } catch {
      parts.push(
        'Use o link do repositório Git, por exemplo: https://github.com/usuario/projeto (não use github.io).',
      )
    }
  }

  parts.push(
    'Requisitos no servidor: Git instalado e Node.js 20 ou superior (npm install + npm run build podem levar vários minutos).',
  )

  const tail = input.commandOutput ? tailLines(input.commandOutput) : ''
  if (tail) {
    parts.push(`Últimas linhas do log:\n${tail}`)
  }

  return parts.join('\n\n')
}
