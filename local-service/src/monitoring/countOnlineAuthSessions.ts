import { listOnlineAuthUsers, ONLINE_IDLE_MINUTES } from './listOnlineAuthUsers.ts'

/** Sessões Auth com atividade recente (proxy de “online” em tempo quase real). */
export async function countOnlineAuthSessions(
  dbUrl: string,
  idleMinutes = ONLINE_IDLE_MINUTES,
): Promise<{ count: number | null; detail: string | null }> {
  const listed = await listOnlineAuthUsers(dbUrl, idleMinutes)
  if (listed.detail?.includes('Não foi possível consultar')) {
    return { count: null, detail: listed.detail }
  }
  return { count: listed.users.length, detail: listed.detail }
}
