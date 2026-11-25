import { enrichStatusWithLocalHttpProbe } from './enrichLocalHttpProbe.ts'
import { enrichStatusWithAccessMode } from './enrichSystemAccessMode.ts'
import type { RuntimeActionResponse, RuntimeStateSnapshot } from './types.ts'

async function enrichStatusForApi(status: RuntimeStateSnapshot): Promise<RuntimeStateSnapshot> {
  const withAccessMode = enrichStatusWithAccessMode(status)
  return enrichStatusWithLocalHttpProbe(withAccessMode)
}

export async function attachRemoteAccessToResponse(
  response: RuntimeActionResponse,
): Promise<RuntimeActionResponse> {
  if (!response.ok || !response.status) return response
  const status = await enrichStatusForApi(response.status)
  return { ok: true, status }
}
