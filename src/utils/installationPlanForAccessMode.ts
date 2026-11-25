import type { InstallationPlan } from '../types/installationPlan.ts'
import type { SystemAccessMode } from '../types/systemAccessMode.ts'

/** Plano do manifesto — sem alterações por modo (local vs LAN). */
export function installationPlanForAccessMode(
  plan: InstallationPlan | undefined,
  _accessMode: SystemAccessMode | null,
): InstallationPlan | undefined {
  return plan
}
