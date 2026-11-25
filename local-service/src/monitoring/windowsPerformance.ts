import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function runPowerShell(script: string, timeoutMs = 8000): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: timeoutMs, maxBuffer: 512 * 1024 },
  )
  return stdout.trim()
}

export async function readWindowsCpuUsagePercent(): Promise<{ value: number | null; detail: string | null }> {
  if (process.platform !== 'win32') {
    return { value: null, detail: 'Coleta de CPU disponível apenas no Windows.' }
  }
  try {
    const raw = await runPowerShell(
      '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average',
    )
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value)) {
      return { value: null, detail: 'Não foi possível interpretar a carga da CPU.' }
    }
    return { value: Math.max(0, Math.min(100, value)), detail: 'Win32_Processor.LoadPercentage (média)' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { value: null, detail: `Falha ao consultar CPU: ${message}` }
  }
}

/** Taxa agregada (bytes/s) das interfaces físicas/virtuais ativas. */
export async function readWindowsNetworkRates(): Promise<{
  inPerSec: number | null
  outPerSec: number | null
  detail: string | null
}> {
  if (process.platform !== 'win32') {
    return { inPerSec: null, outPerSec: null, detail: 'Coleta de rede disponível apenas no Windows.' }
  }
  try {
    const raw = await runPowerShell(
      `$r=Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Where-Object { $_.Name -notmatch 'isatap|loopback|teredo' -and $_.BytesReceivedPersec -ne $null }; ` +
        `@{ received = ($r | Measure-Object -Property BytesReceivedPersec -Sum).Sum; sent = ($r | Measure-Object -Property BytesSentPersec -Sum).Sum } | ConvertTo-Json -Compress`,
    )
    const parsed = JSON.parse(raw) as { received?: number; sent?: number }
    if (typeof parsed.received !== 'number' || typeof parsed.sent !== 'number') {
      return { inPerSec: null, outPerSec: null, detail: 'Contadores de rede indisponíveis.' }
    }
    return {
      inPerSec: Math.max(0, parsed.received),
      outPerSec: Math.max(0, parsed.sent),
      detail: 'Win32_PerfFormattedData_Tcpip_NetworkInterface (soma bytes/s)',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { inPerSec: null, outPerSec: null, detail: message }
  }
}

export function readMemoryUsage(): {
  usedPercent: number | null
  usedBytes: number | null
  totalBytes: number | null
  detail: string | null
} {
  try {
    const total = os.totalmem()
    const free = os.freemem()
    if (total <= 0) {
      return { usedPercent: null, usedBytes: null, totalBytes: null, detail: 'Memória total inválida.' }
    }
    const used = total - free
    const usedPercent = Math.round((used / total) * 100)
    return {
      usedPercent,
      usedBytes: used,
      totalBytes: total,
      detail: 'os.totalmem / os.freemem',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { usedPercent: null, usedBytes: null, totalBytes: null, detail: message }
  }
}
