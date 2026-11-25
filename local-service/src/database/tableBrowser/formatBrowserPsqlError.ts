/** Mensagem curta para a UI — nunca expõe SQL nem dump completo do psql. */
export function formatBrowserPsqlError(detail: string, code?: string): string {
  const lower = detail.toLowerCase()
  if (lower.includes('timed out') || lower.includes('etimedout')) {
    return (
      'PostgreSQL demorou para responder. Confirme Docker Desktop e que o sistema está iniciado em Sistemas.'
    )
  }
  if (code === 'PERMISSION_DENIED') {
    return 'Sem permissão para ler estes dados (privilégios ou RLS).'
  }
  if (code === 'CONNECTION_FAILED') {
    return (
      'PostgreSQL local (Supabase) não está aceitando conexões na porta configurada. ' +
      'Abra Sistemas, selecione a instalação e use Iniciar (ou aguarde o stack subir) e tente de novo.'
    )
  }

  if (
    lower.includes('command failed') ||
    lower.includes('fechou a conex') ||
    lower.includes('closed the connection') ||
    lower.includes('could not connect') ||
    lower.includes('connection refused') ||
    lower.includes('54322')
  ) {
    return (
      'Não foi possível conectar ao PostgreSQL local. Confirme Docker Desktop em execução e o sistema ' +
      'instalado iniciado na aba Sistemas.'
    )
  }

  if (detail.length > 220) {
    return `${detail.slice(0, 217)}…`
  }
  return detail || 'Falha ao consultar o banco.'
}
