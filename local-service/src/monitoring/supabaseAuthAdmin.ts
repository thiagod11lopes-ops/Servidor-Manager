import type { AuthUserRow, AuthUsersPage } from './types.ts'
import type { SupabaseStatusJson } from './supabaseLocalInspect.ts'
import { fetchSupabaseLocalJson } from './supabaseLocalHttp.ts'

const PAGE_SIZE = 25

function authHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  }
}

function mapUser(raw: Record<string, unknown>): AuthUserRow {
  return {
    id: String(raw.id ?? ''),
    email: typeof raw.email === 'string' ? raw.email : null,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : null,
    lastSignInAt: typeof raw.last_sign_in_at === 'string' ? raw.last_sign_in_at : null,
    banned: typeof raw.banned_until === 'string' ? raw.banned_until !== 'none' : null,
    disabled: typeof raw.user_metadata === 'object' && raw.user_metadata
      ? Boolean((raw.user_metadata as Record<string, unknown>).disabled)
      : null,
  }
}

export async function listSupabaseAuthUsers(
  systemId: string,
  status: SupabaseStatusJson,
  options: { page?: number; query?: string },
): Promise<AuthUsersPage> {
  const apiUrl = status.API_URL
  const serviceRole = status.SERVICE_ROLE_KEY
  if (!apiUrl || !serviceRole) {
    return {
      ok: false,
      message: 'Supabase local não expôs API_URL ou SERVICE_ROLE_KEY (stack parado ou status indisponível).',
      users: [],
      total: null,
      page: options.page ?? 1,
      pageSize: PAGE_SIZE,
      capabilities: { list: false, disable: false, delete: false },
    }
  }

  const page = Math.max(1, options.page ?? 1)
  const path = `/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`

  try {
    const response = await fetchSupabaseLocalJson(systemId, status, path, {
      method: 'GET',
      headers: authHeaders(serviceRole),
      timeoutMs: 20_000,
    })
    if (!response.ok) {
      return {
        ok: false,
        message:
          response.detail ??
          (response.status ? `Auth admin respondeu HTTP ${response.status}.` : 'Auth admin indisponível.'),
        users: [],
        total: null,
        page,
        pageSize: PAGE_SIZE,
        capabilities: { list: false, disable: false, delete: false },
      }
    }
    const payload = (response.json ?? {}) as { users?: unknown[]; total?: number }
    let users = (payload.users ?? [])
      .filter((u): u is Record<string, unknown> => Boolean(u && typeof u === 'object'))
      .map(mapUser)

    const q = options.query?.trim().toLowerCase()
    if (q) {
      users = users.filter((u) => u.email?.toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    }

    return {
      ok: true,
      message: null,
      users,
      total: typeof payload.total === 'number' ? payload.total : users.length,
      page,
      pageSize: PAGE_SIZE,
      capabilities: { list: true, disable: true, delete: true },
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    const message =
      raw.toLowerCase().includes('fetch failed') || raw.toLowerCase().includes('econnrefused')
        ? 'API Auth Supabase (porta 54321) indisponível. Confirme Docker Desktop e o sistema em Executando na aba Sistemas.'
        : raw
    return {
      ok: false,
      message,
      users: [],
      total: null,
      page,
      pageSize: PAGE_SIZE,
      capabilities: { list: false, disable: false, delete: false },
    }
  }
}

export async function disableSupabaseAuthUser(
  systemId: string,
  status: SupabaseStatusJson,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const apiUrl = status.API_URL
  const serviceRole = status.SERVICE_ROLE_KEY
  if (!apiUrl || !serviceRole) {
    return { ok: false, message: 'Supabase local indisponível para administração.' }
  }
  const path = `/auth/v1/admin/users/${encodeURIComponent(userId)}`
  try {
    const response = await fetchSupabaseLocalJson(systemId, status, path, {
      method: 'PUT',
      headers: authHeaders(serviceRole),
      body: JSON.stringify({ ban_duration: '876000h' }),
      timeoutMs: 20_000,
    })
    if (!response.ok) {
      return {
        ok: false,
        message: response.detail ?? `Falha ao desabilitar usuário (HTTP ${response.status}).`,
      }
    }
    return { ok: true, message: 'Conta desabilitada (ban administrativo).' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function deleteSupabaseAuthUser(
  systemId: string,
  status: SupabaseStatusJson,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const apiUrl = status.API_URL
  const serviceRole = status.SERVICE_ROLE_KEY
  if (!apiUrl || !serviceRole) {
    return { ok: false, message: 'Supabase local indisponível para administração.' }
  }
  const path = `/auth/v1/admin/users/${encodeURIComponent(userId)}`
  try {
    const response = await fetchSupabaseLocalJson(systemId, status, path, {
      method: 'DELETE',
      headers: authHeaders(serviceRole),
      body: JSON.stringify({ should_soft_delete: false }),
      timeoutMs: 20_000,
    })
    if (!response.ok) {
      return {
        ok: false,
        message: response.detail ?? `Falha ao excluir usuário do Auth (HTTP ${response.status}).`,
      }
    }
    return {
      ok: true,
      message:
        'Usuário removido do Auth local. Dados relacionados (documentos, registros, arquivos) podem permanecer no banco e no Storage.',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
