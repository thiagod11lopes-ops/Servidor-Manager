import path from 'node:path'
import { getSystemRoot } from '../installation/paths.ts'

export function getDatabaseProfilePath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'database-profile.json')
}
