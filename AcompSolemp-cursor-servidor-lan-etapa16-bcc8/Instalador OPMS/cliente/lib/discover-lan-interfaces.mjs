import os from 'node:os'

const VIRTUAL_INTERFACE_NAME =
  /tailscale|vethernet|wsl|virtualbox|vmware|hyper-v|loopback|bluetooth|teredo|isatap|npcap|wireguard|conexão local|local area connection\*/i

/**
 * Endereços de broadcast por interface física (ignora WSL/Docker/Hyper-V).
 * @returns {{ broadcast: string, address: string, interfaceName: string }[]}
 */
export function listOmpsLanDiscoveryBroadcastTargets() {
  /** @type {{ broadcast: string, address: string, interfaceName: string }[]} */
  const perInterface = []
  const nets = os.networkInterfaces()
  for (const [name, entries] of Object.entries(nets)) {
    if (!entries || VIRTUAL_INTERFACE_NAME.test(name)) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      if (entry.address.startsWith('169.254.')) continue
      if (!entry.netmask) continue
      const ipParts = entry.address.split('.').map((p) => Number.parseInt(p, 10))
      const maskParts = entry.netmask.split('.').map((p) => Number.parseInt(p, 10))
      if (ipParts.length !== 4 || maskParts.length !== 4) continue
      const broadcast = ipParts.map((p, i) => p | (~maskParts[i] & 255)).join('.')
      perInterface.push({ broadcast, address: entry.address, interfaceName: name })
    }
  }
  return perInterface
}
