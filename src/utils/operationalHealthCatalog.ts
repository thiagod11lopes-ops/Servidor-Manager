import type { OperationalHealthLevel } from '../types/monitoring.ts'

export type OperationalHealthDefinition = {
  level: OperationalHealthLevel
  label: string
  description: string
}

export const OPERATIONAL_HEALTH_DEFINITIONS: OperationalHealthDefinition[] = [
  {
    level: 'operational',
    label: 'Operacional',
    description: 'Todos os componentes essenciais estão funcionando normalmente.',
  },
  {
    level: 'attention',
    label: 'Atenção',
    description:
      'Existe um aviso ou uma condição que merece acompanhamento, mas o sistema continua funcionando.',
  },
  {
    level: 'degraded',
    label: 'Degradado',
    description: 'O sistema funciona parcialmente, com alguma funcionalidade importante comprometida.',
  },
  {
    level: 'unavailable',
    label: 'Indisponível',
    description: 'O sistema não está acessível ou uma função essencial parou de funcionar.',
  },
  {
    level: 'checking',
    label: 'Verificando',
    description: 'O sistema está realizando verificações para determinar sua condição atual.',
  },
]

export function operationalHealthTone(
  level: OperationalHealthLevel,
): 'success' | 'warning' | 'error' | 'muted' {
  if (level === 'operational') return 'success'
  if (level === 'attention') return 'warning'
  if (level === 'degraded' || level === 'unavailable') return 'error'
  return 'muted'
}
