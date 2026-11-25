export function formatDatabaseBrowserClientError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name
    const msg = error.message.toLowerCase()
    if (name === 'TimeoutError' || msg.includes('signal timed out') || msg.includes('aborted')) {
      return (
        'A operação demorou mais que o esperado (Supabase/Docker pode estar iniciando). ' +
        'Aguarde na aba Sistemas com o sistema em Executando e abra Banco de dados de novo.'
      )
    }
  }
  return error instanceof Error ? error.message : String(error)
}
