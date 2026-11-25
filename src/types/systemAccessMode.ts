/** Como utilizadores acedem ao sistema hospedado (escolha por sistema). */
export type SystemAccessMode = 'local' | 'lan'

export const SYSTEM_ACCESS_MODE_VERSION = 2

export type SystemAccessModeConfig = {
  mode: SystemAccessMode
  chosenAt: string
  version: typeof SYSTEM_ACCESS_MODE_VERSION
}

export function isSystemAccessMode(value: unknown): value is SystemAccessMode {
  return value === 'local' || value === 'lan'
}
