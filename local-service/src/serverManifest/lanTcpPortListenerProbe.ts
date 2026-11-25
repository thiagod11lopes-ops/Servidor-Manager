import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type TcpPortListenerIdentity = {
  port: number
  localAddress: string | null
  pid: number | null
  processName: string | null
  executablePath: string | null
  commandLine: string | null
  serviceName: string | null
  identityConfidence: 'confirmed' | 'partial' | 'unknown'
}

export type TcpPortListenerProbeResult =
  | { ok: true; listening: false; listeners: [] }
  | { ok: true; listening: true; listeners: TcpPortListenerIdentity[] }
  | { ok: false; message: string }

export type TcpPortListenerProbe = (port: number) => Promise<TcpPortListenerProbeResult>

let probeOverride: TcpPortListenerProbe | null = null

/** Hook de teste — restaurar com `setTcpPortListenerProbeForTests(null)`. */
export function setTcpPortListenerProbeForTests(probe: TcpPortListenerProbe | null): void {
  probeOverride = probe
}

function normalizeListener(raw: {
  port: number
  localAddress?: string | null
  pid?: number | null
  processName?: string | null
  executablePath?: string | null
  commandLine?: string | null
  serviceName?: string | null
}): TcpPortListenerIdentity {
  const pid = typeof raw.pid === 'number' && raw.pid > 0 ? raw.pid : null
  const processName =
    typeof raw.processName === 'string' && raw.processName.trim().length > 0 ? raw.processName.trim() : null
  const executablePath =
    typeof raw.executablePath === 'string' && raw.executablePath.trim().length > 0
      ? raw.executablePath.trim()
      : null
  const commandLine =
    typeof raw.commandLine === 'string' && raw.commandLine.trim().length > 0 ? raw.commandLine.trim() : null

  let identityConfidence: TcpPortListenerIdentity['identityConfidence'] = 'unknown'
  if (pid != null && processName && executablePath) identityConfidence = 'confirmed'
  else if (pid != null && processName) identityConfidence = 'partial'

  return {
    port: raw.port,
    localAddress: raw.localAddress ?? null,
    pid,
    processName,
    executablePath,
    commandLine,
    serviceName: raw.serviceName ?? null,
    identityConfidence,
  }
}

async function probeWindows(port: number): Promise<TcpPortListenerProbeResult> {
  const script = [
    '$ErrorActionPreference = "Stop"',
    `$port = ${port}`,
    '$rows = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)',
    'if ($rows.Count -eq 0) { Write-Output "[]"; exit 0 }',
    '$out = @()',
    'foreach ($conn in $rows) {',
    '  $proc = $null',
    '  if ($conn.OwningProcess) {',
    '    $proc = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $conn.OwningProcess) -ErrorAction SilentlyContinue',
    '  }',
    '  $svc = $null',
    '  if ($proc -and $proc.ProcessId) {',
    '    $svcRow = Get-CimInstance Win32_Service -Filter ("ProcessId = " + $proc.ProcessId) -ErrorAction SilentlyContinue | Select-Object -First 1',
    '    if ($svcRow) { $svc = $svcRow.Name }',
    '  }',
    '  $out += [PSCustomObject]@{',
    '    localAddress = [string]$conn.LocalAddress',
    '    pid = [int]$conn.OwningProcess',
    '    processName = $(if ($proc) { [string]$proc.Name } else { $null })',
    '    executablePath = $(if ($proc) { [string]$proc.ExecutablePath } else { $null })',
    '    commandLine = $(if ($proc) { [string]$proc.CommandLine } else { $null })',
    '    serviceName = $svc',
    '  }',
    '}',
    '$out | ConvertTo-Json -Compress',
  ].join('\n')

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 },
    )
    const trimmed = stdout.trim()
    if (!trimmed || trimmed === '[]') {
      return { ok: true, listening: false, listeners: [] }
    }
    const parsed = JSON.parse(trimmed) as Record<string, unknown> | Record<string, unknown>[]
    const items = Array.isArray(parsed) ? parsed : [parsed]
    const listeners = items.map((item) =>
      normalizeListener({
        port,
        localAddress: typeof item.localAddress === 'string' ? item.localAddress : null,
        pid: typeof item.pid === 'number' ? item.pid : Number.parseInt(String(item.pid ?? ''), 10) || null,
        processName: typeof item.processName === 'string' ? item.processName : null,
        executablePath: typeof item.executablePath === 'string' ? item.executablePath : null,
        commandLine: typeof item.commandLine === 'string' ? item.commandLine : null,
        serviceName: typeof item.serviceName === 'string' ? item.serviceName : null,
      }),
    )
    return { ok: true, listening: listeners.length > 0, listeners }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: `Não foi possível consultar processos escutando na porta ${port} (Windows): ${detail}`,
    }
  }
}

async function probeLinux(port: number): Promise<TcpPortListenerProbeResult> {
  try {
    const { stdout } = await execFileAsync('ss', ['-H', '-tlnp', `sport = :${port}`], {
      timeout: 10_000,
      maxBuffer: 512 * 1024,
    })
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      return { ok: true, listening: false, listeners: [] }
    }

    const listeners: TcpPortListenerIdentity[] = []
    for (const line of lines) {
      const localMatch = /(\S+):(\d+)\s/.exec(line)
      const localAddress = localMatch?.[1] ?? null
      const pidMatch = /pid=(\d+)/.exec(line)
      const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : null
      let processName: string | null = null
      const nameMatch = /users:\(\("([^"]+)"/.exec(line)
      if (nameMatch) processName = nameMatch[1]
      listeners.push(
        normalizeListener({
          port,
          localAddress,
          pid,
          processName,
        }),
      )
    }
    return { ok: true, listening: listeners.length > 0, listeners }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: `Não foi possível consultar processos escutando na porta ${port} (Linux): ${detail}`,
    }
  }
}

async function defaultProbe(port: number): Promise<TcpPortListenerProbeResult> {
  if (process.platform === 'win32') return probeWindows(port)
  if (process.platform === 'linux') return probeLinux(port)
  return {
    ok: false,
    message: `Diagnóstico de porta TCP não disponível nesta plataforma (${process.platform}).`,
  }
}

export async function probeTcpPortListeners(port: number): Promise<TcpPortListenerProbeResult> {
  if (probeOverride) return probeOverride(port)
  return defaultProbe(port)
}
