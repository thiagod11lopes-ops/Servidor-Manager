import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SupabaseStatusJson } from './supabaseLocalInspect.ts'
import { readSupabaseProjectId, supabaseDbContainerName } from '../database/tableBrowser/supabaseLocalDbContainer.ts'

const execFileAsync = promisify(execFile)

const CURL_IMAGE = 'curlimages/curl:8.6.0'
const KONG_INTERNAL_BASE = 'http://127.0.0.1:8000'
const DEFAULT_TIMEOUT_MS = 15_000

function supabaseKongContainerName(projectId: string): string {
  return `supabase_kong_${projectId.trim()}`
}

export function resolveSupabaseKongContainer(systemId: string): string | null {
  const projectId = readSupabaseProjectId(systemId)
  if (!projectId) return null
  return supabaseKongContainerName(projectId)
}

/** Compat: nome legado usado em outros pontos do repo. */
export function resolveSupabaseDbContainer(systemId: string): string | null {
  const projectId = readSupabaseProjectId(systemId)
  if (!projectId) return null
  return supabaseDbContainerName(projectId)
}

function isHostFetchFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('closed') ||
    lower.includes('econnreset') ||
    lower.includes('unexpectedly') ||
    lower.includes('timed out') ||
    lower.includes('etimedout')
  )
}

function externalToInternalUrl(apiUrl: string, requestUrl: URL): string {
  const path = `${requestUrl.pathname}${requestUrl.search}`
  return `${KONG_INTERNAL_BASE}${path}`
}

async function curlViaKongNetwork(
  kongContainer: string,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: string; detail: string | null }> {
  const args = [
    'run',
    '--rm',
    '--network',
    `container:${kongContainer}`,
    CURL_IMAGE,
    '-sS',
    '-w',
    '\n__HTTP_STATUS__:%{http_code}',
    '-X',
    method.toUpperCase(),
  ]

  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`)
  }

  if (body != null && body.length > 0 && method.toUpperCase() !== 'GET') {
    args.push('-d', body)
  }

  args.push(url)

  try {
    const { stdout } = await execFileAsync('docker', args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    })
    const raw = String(stdout ?? '')
    const marker = raw.lastIndexOf('\n__HTTP_STATUS__:')
    if (marker < 0) {
      return { ok: false, status: 0, body: raw, detail: 'Resposta curl sem código HTTP.' }
    }
    const bodyText = raw.slice(0, marker)
    const status = Number.parseInt(raw.slice(marker + '\n__HTTP_STATUS__:'.length).trim(), 10)
    if (!Number.isFinite(status)) {
      return { ok: false, status: 0, body: bodyText, detail: 'Código HTTP inválido do curl.' }
    }
    return { ok: status >= 200 && status < 300, status, body: bodyText, detail: null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 0, body: '', detail }
  }
}

export type SupabaseLocalFetchResult = {
  ok: boolean
  status: number
  json: unknown
  detail: string | null
}

export async function fetchSupabaseLocalJson(
  systemId: string,
  status: SupabaseStatusJson,
  pathWithQuery: string,
  init: {
    method?: string
    headers?: Record<string, string>
    body?: string
    timeoutMs?: number
  } = {},
): Promise<SupabaseLocalFetchResult> {
  const apiUrl = status.API_URL?.replace(/\/+$/, '')
  if (!apiUrl) {
    return { ok: false, status: 0, json: null, detail: 'API_URL ausente no status Supabase.' }
  }

  const method = init.method ?? 'GET'
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers = init.headers ?? {}
  const hostUrl = `${apiUrl}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`

  try {
    const response = await fetch(hostUrl, {
      method,
      headers,
      body: init.body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    let json: unknown = null
    if (text.trim()) {
      try {
        json = JSON.parse(text) as unknown
      } catch {
        json = text
      }
    }
    return { ok: response.ok, status: response.status, json, detail: response.ok ? null : text.slice(0, 300) }
  } catch (error) {
    if (!isHostFetchFailure(error)) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, status: 0, json: null, detail }
    }
  }

  const kongContainer = resolveSupabaseKongContainer(systemId)
  if (!kongContainer) {
    return {
      ok: false,
      status: 0,
      json: null,
      detail:
        'Não foi possível alcançar a API Supabase (porta 54321) nem resolver o container Kong. Confirme Docker Desktop e Sistemas → Iniciar.',
    }
  }

  const internalUrl = externalToInternalUrl(apiUrl, new URL(hostUrl))
  const curled = await curlViaKongNetwork(
    kongContainer,
    method,
    internalUrl,
    headers,
    init.body,
    timeoutMs,
  )

  if (!curled.body.trim() && !curled.ok) {
    return {
      ok: false,
      status: curled.status,
      json: null,
      detail:
        curled.detail ??
        'Falha ao chamar Auth/API via Docker (porta publicada indisponível no Windows). Verifique Docker Desktop.',
    }
  }

  let json: unknown = null
  try {
    json = curled.body.trim() ? (JSON.parse(curled.body) as unknown) : null
  } catch {
    json = curled.body
  }

  return {
    ok: curled.ok,
    status: curled.status,
    json,
    detail: curled.ok ? null : String(json ?? curled.body).slice(0, 300),
  }
}
