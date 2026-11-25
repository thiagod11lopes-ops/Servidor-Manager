/** Mensagem quando a UI não consegue falar com o local-service (47831 / proxy :5199). */
export const LOCAL_SERVICE_UNREACHABLE_MESSAGE =
  'Serviço local do Manager indisponível (porta 47831). Feche todas as janelas do Manager e abra de novo pelo atalho Servidor Manager. Aguarde alguns segundos e tente outra vez.'

export function formatLocalServiceCommunicationError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (
      msg.includes('fetch failed') ||
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('local_service_unavailable')
    ) {
      return LOCAL_SERVICE_UNREACHABLE_MESSAGE
    }
    if (msg.includes('signal timed out') || msg.includes('timeout') || msg.includes('aborted')) {
      return (
        'Tempo esgotado ao contactar o serviço local (47831). Verifique se o Manager foi iniciado pelo atalho e tente novamente.'
      )
    }
    if (msg.includes('local_service_invalid_response')) {
      return 'Resposta inválida do serviço local. Reinicie o Manager pelo atalho Servidor Manager.'
    }
    return error.message
  }
  return LOCAL_SERVICE_UNREACHABLE_MESSAGE
}
