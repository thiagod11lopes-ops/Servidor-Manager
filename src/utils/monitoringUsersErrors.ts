export function formatAuthUsersClientError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('fetch failed') || msg.includes('failed to fetch')) {
      return (
        'Não foi possível falar com o serviço local (porta 47831). Feche e abra o Servidor Manager ou aguarde alguns segundos após iniciar.'
      )
    }
    if (msg.includes('signal timed out') || msg.includes('timeout')) {
      return 'A consulta demorou demais. Confirme Docker Desktop e o sistema em Executando na aba Sistemas.'
    }
  }
  return error instanceof Error ? error.message : String(error)
}

export function formatAuthUsersApiMessage(message: string | null | undefined): string {
  if (!message?.trim()) return 'Não foi possível carregar usuários Auth.'
  const lower = message.toLowerCase()
  if (lower.includes('fetch failed')) {
    return 'API Auth Supabase (porta 54321) indisponível. Confirme Docker Desktop e Sistemas → Iniciar.'
  }
  return message
}
