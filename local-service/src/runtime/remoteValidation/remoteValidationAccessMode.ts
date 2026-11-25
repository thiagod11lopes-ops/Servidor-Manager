export type RemoteValidationAccessModeBlockReason = 'REMOVED'

export function getRemoteValidationAccessModeBlockReason(_systemId: string): RemoteValidationAccessModeBlockReason {
  return 'REMOVED'
}

export function remoteValidationAccessModeBlockMessage(_reason: RemoteValidationAccessModeBlockReason): string {
  return 'Validação remota descontinuada. Use o modo Rede local (LAN) para aceder a partir de outros dispositivos na mesma Wi‑Fi ou cabo.'
}
