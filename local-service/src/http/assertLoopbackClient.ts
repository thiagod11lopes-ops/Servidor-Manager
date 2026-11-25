import type { IncomingMessage } from 'node:http'

export function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false
  if (remoteAddress === '127.0.0.1' || remoteAddress === '::1') return true
  if (remoteAddress.startsWith('::ffff:127.0.0.1')) return true
  return false
}

export function isLoopbackClientRequest(req: IncomingMessage): boolean {
  return isLoopbackRemoteAddress(req.socket?.remoteAddress)
}
