import { discoverInstalledSystems } from '../systems/discoverInstalledSystems.ts'
import { countOnlineAuthSessions } from './countOnlineAuthSessions.ts'
import { listOnlineAuthUsers } from './listOnlineAuthUsers.ts'
import { readSupabaseStatusJson } from './supabaseLocalInspect.ts'
import type { OnlineUserEntry, OnlineUsersOverview } from './types.ts'

function systemLabelFromSource(sourceUrl: string | null, systemId: string): string {
  if (sourceUrl) {
    const tree = /github\.com\/[^/]+\/([^/]+)/i.exec(sourceUrl)
    if (tree?.[1]) return tree[1].replace(/\.git$/i, '')
  }
  return `Sistema ${systemId.slice(0, 8)}`
}

export async function collectOnlineUsersOverview(): Promise<OnlineUsersOverview> {
  const collectedAt = new Date().toISOString()
  const systems = await discoverInstalledSystems()
  const perSystem: OnlineUsersOverview['perSystem'] = []
  const users: OnlineUserEntry[] = []
  let total = 0
  let anyMeasured = false

  for (const system of systems) {
    const supa = await readSupabaseStatusJson(system.systemId)
    const label = systemLabelFromSource(system.sourceUrl, system.systemId)
    const databaseNumber = system.databaseNumber ?? null
    if (!supa.ok || !supa.status?.DB_URL) {
      perSystem.push({
        systemId: system.systemId,
        databaseNumber,
        count: null,
        detail: supa.detail ?? 'Supabase local indisponível',
      })
      continue
    }

    const listed = await listOnlineAuthUsers(supa.status.DB_URL)
    if (listed.detail?.includes('Não foi possível consultar')) {
      const counted = await countOnlineAuthSessions(supa.status.DB_URL)
      perSystem.push({
        systemId: system.systemId,
        databaseNumber,
        count: counted.count,
        detail: counted.detail,
      })
      continue
    }

    anyMeasured = true
    total += listed.users.length
    perSystem.push({
      systemId: system.systemId,
      databaseNumber,
      count: listed.users.length,
      detail: listed.detail,
    })
    for (const row of listed.users) {
      users.push({
        ...row,
        systemId: system.systemId,
        systemLabel: label,
        databaseNumber,
      })
    }
  }

  users.sort((a, b) => {
    const ta = a.lastActivityAt ?? ''
    const tb = b.lastActivityAt ?? ''
    return tb.localeCompare(ta)
  })

  if (!anyMeasured) {
    return {
      collectedAt,
      count: null,
      detail:
        systems.length === 0
          ? 'Nenhuma instalação manifesto no disco.'
          : 'Auth/Postgres indisponível nos sistemas instalados.',
      perSystem,
      users: [],
    }
  }

  return {
    collectedAt,
    count: total,
    detail: `${total} usuário(s) online (sessões ativas agregadas)`,
    perSystem,
    users,
  }
}
