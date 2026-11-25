import type { DatabaseSummary } from '../types/database.ts'
import type { ServerInstalledInventory } from '../types/managerService.ts'

export type DashboardInstalledSystemsDisplay = {
  value: string
  detail: string
}

function runtimeDetailSuffix(databaseSummary: DatabaseSummary): string {
  return `${databaseSummary.systemsRequiringDatabase} exigem banco · PostgreSQL local ${databaseSummary.postgresqlServerAvailable ? 'disponível' : 'não confirmado'}`
}

/**
 * Card “Sistemas instalados”: só contagens confirmadas pelo local-service (disco).
 * Cadastros no localStorage com status `instalado` não entram aqui.
 */
export function buildDashboardInstalledSystemsDisplay(
  inventory: ServerInstalledInventory,
  databaseSummary: DatabaseSummary,
): DashboardInstalledSystemsDisplay {
  if (!inventory.confirmed) {
    return {
      value: '—',
      detail: inventory.message,
    }
  }

  const { summary } = inventory
  if (summary.installed === 0) {
    return {
      value: '0',
      detail: `Nenhum sistema instalado no servidor · ${runtimeDetailSuffix(databaseSummary)}`,
    }
  }

  return {
    value: String(summary.installed),
    detail: `${summary.installed} instalado(s) · ${summary.running} executando · ${summary.stopped} parado(s) · ${summary.error} com erro · ${runtimeDetailSuffix(databaseSummary)}`,
  }
}
