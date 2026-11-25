import type { ManagedSystem } from '../types/system.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'

export function isAcompSolempSystem(
  system: ManagedSystem,
  runtimeStatus?: SystemRuntimeStatus | null,
): boolean {
  if (/acompsolemp/i.test(system.url)) return true
  if (system.analysis?.serverManifest) return true
  if (system.installationPlan?.packageManager === 'manifest') return true
  if (runtimeStatus?.runtimeKind === 'manifest-lan') return true
  return false
}
