import type { ComponentType, SVGProps } from 'react'
import type { AppView } from '../types/navigation.ts'
import {
  DashboardIcon,
  DatabaseIcon,
  ServerIcon,
  SystemsIcon,
  UpdatesIcon,
  UsersIcon,
} from '../components/Icons.tsx'

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>

export type AppNavCatalogEntry = {
  id: string
  title: string
  description: string
  icon: NavIcon
  /** Ilustração local (public/nav), servida com base relativa do Vite. */
  imageSrc: string
  /** Destino real quando implementado; ausente = cartão só visual nesta etapa. */
  view?: AppView
  /** Cartão visível sem rota — exibido como “Em desenvolvimento”. */
  developmentOnly: boolean
}

export const APP_NAV_CATALOG: AppNavCatalogEntry[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Visão geral e preparação do computador servidor.',
    icon: DashboardIcon,
    imageSrc: './nav/dashboard.webp?v=2',
    view: 'dashboard',
    developmentOnly: false,
  },
  {
    id: 'servidor',
    title: 'Servidor',
    description: 'Funcionamento em tempo real, armazenamento e capacidade do host.',
    icon: ServerIcon,
    imageSrc: './nav/servidor.webp',
    view: 'servidor',
    developmentOnly: false,
  },
  {
    id: 'banco-de-dados',
    title: 'Banco de dados',
    description: 'Consulta somente leitura às tabelas PostgreSQL do Supabase local.',
    icon: DatabaseIcon,
    imageSrc: './nav/banco-de-dados.webp',
    view: 'banco-dados',
    developmentOnly: false,
  },
  {
    id: 'sistemas',
    title: 'Sistemas',
    description: 'Instalar, iniciar e operar os sistemas cadastrados.',
    icon: SystemsIcon,
    imageSrc: './nav/sistemas.webp',
    view: 'sistemas',
    developmentOnly: false,
  },
  {
    id: 'usuarios',
    title: 'Usuários',
    description: 'Administração local de contas (Supabase Auth) dos sistemas AcompSolemp.',
    icon: UsersIcon,
    imageSrc: './nav/usuarios.webp',
    view: 'usuarios',
    developmentOnly: false,
  },
  {
    id: 'atualizacao',
    title: 'Atualizações',
    description: 'Versão instalada e histórico do Manager.',
    icon: UpdatesIcon,
    imageSrc: './nav/atualizacao.webp',
    view: 'atualizacao',
    developmentOnly: false,
  },
]
