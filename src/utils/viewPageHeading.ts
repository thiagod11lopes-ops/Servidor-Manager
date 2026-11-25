import type { AppView } from '../types/navigation.ts'

export type ViewPageHeading = {
  title: string
  subtitle: string
}

const VIEW_PAGE_HEADINGS: Record<AppView, ViewPageHeading> = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Visão geral do ambiente.',
  },
  sistemas: {
    title: 'Meus Sistemas',
    subtitle: 'Selecione um sistema à esquerda; operação e detalhes ficam ao lado, sem rolar a página inteira.',
  },
  atualizacao: {
    title: 'Atualizações',
    subtitle:
      'Histórico de versões do Servidor Manager e melhorias registradas no desenvolvimento com Cursor.',
  },
  servidor: {
    title: 'Servidor',
    subtitle: 'Monitoramento, armazenamento e alertas — serviço local.',
  },
  'banco-dados': {
    title: 'Banco de dados',
    subtitle: 'Table editor somente leitura — PostgreSQL local do sistema selecionado.',
  },
  armazenamento: {
    title: 'Servidor',
    subtitle: 'Monitoramento, armazenamento e alertas — serviço local.',
  },
  usuarios: {
    title: 'Usuários (administração local)',
    subtitle:
      'Consulta e ações via API administrativa do Supabase local (somente localhost). Credenciais privilegiadas não são expostas ao navegador.',
  },
  configuracoes: {
    title: 'Configurações',
    subtitle: 'Preferências do Servidor Manager neste computador.',
  },
}

export function viewPageHeading(view: AppView): ViewPageHeading {
  return VIEW_PAGE_HEADINGS[view]
}
