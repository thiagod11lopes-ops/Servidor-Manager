import { getSystemRoot } from '../installation/paths.ts'
import { getOrCreateOmpsLanDiscoveryInstanceId } from '../products/ompsLanDiscoveryIdentity.ts'
import type { ServidorOmpsFixedLanPolicy } from '../products/servidorOmpsFixedLanRuntime.ts'
import { startOmpsLanDiscoveryServer, stopOmpsLanDiscoveryServer } from '../network/ompsLanDiscoveryServer.ts'

export async function startOmpsLanDiscoveryForSystem(input: {
  systemId: string
  policy: ServidorOmpsFixedLanPolicy
  httpPort: number
  displayName?: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const instanceId = await getOrCreateOmpsLanDiscoveryInstanceId(getSystemRoot(input.systemId))
  const udpPort = input.policy.fixed.discoveryUdpPort

  return startOmpsLanDiscoveryServer({
    systemId: input.systemId,
    udpPort,
    getAdvertisement: () => {
      const host = input.policy.resolvedHost
      if (!host) return null
      return {
        host,
        httpPort: input.httpPort,
        entryPath: input.policy.fixed.entryPath,
        instanceId,
        displayName: input.displayName ?? input.policy.config.displayName,
      }
    },
  })
}

export async function stopOmpsLanDiscoveryForSystem(systemId: string): Promise<void> {
  await stopOmpsLanDiscoveryServer(systemId)
}
