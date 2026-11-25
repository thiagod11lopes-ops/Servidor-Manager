import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Evita segundo prompt UAC nos scripts .ps1 do manifesto quando o Manager já elevou. */
export const MANAGER_ELEVATED_RUN_ENV = 'SM_MANAGER_ELEVATED_RUN'

export type ElevatedRunResult = { ok: boolean; output: string; exitCode: number | null }

export type ElevatedPowerShellOptions = {
  onStatus?: (line: string) => void
}

async function isWindowsProcessElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
      ],
      { windowsHide: true, timeout: 15_000 },
    )
    return stdout.trim().toLowerCase() === 'true'
  } catch {
    return false
  }
}

/**
 * Executa script .ps1 com elevação (UAC).
 * No Windows PowerShell 5.1, -ArgumentList em lista parte caminhos com espaço e o
 * processo termina com -196608 antes do script. O código de saída do processo
 * elevado também não volta em Process.ExitCode; ele é gravado em arquivo.
 */
export async function runElevatedPowerShellScript(
  scriptPath: string,
  workingDirectory: string,
  options: ElevatedPowerShellOptions = {},
): Promise<ElevatedRunResult> {
  const elevatedChildEnv = {
    ...process.env,
    [MANAGER_ELEVATED_RUN_ENV]: '1',
  }

  if (await isWindowsProcessElevated()) {
    try {
      const { stdout, stderr } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        {
          cwd: workingDirectory,
          windowsHide: false,
          timeout: 300_000,
          maxBuffer: 4 * 1024 * 1024,
          env: elevatedChildEnv,
        },
      )
      const output = `${stdout}\n${stderr}`.trim()
      return { ok: true, output, exitCode: 0 }
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: number }
      const output = `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`.trim()
      const exitCode = typeof err.code === 'number' ? err.code : 1
      return { ok: exitCode === 0, output, exitCode }
    }
  }

  options.onStatus?.(
    'Será exibido o prompt do Windows (UAC) para aplicar regras de firewall — confirme com Sim/Continuar.',
  )

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-elevated-'))
  const runnerPath = path.join(dir, 'runner.ps1')
  const logPath = path.join(dir, 'output.log')
  const codePath = path.join(dir, 'exit.txt')
  const quote = (value: string) => value.replace(/'/g, "''")
  const runner = [
    "$ErrorActionPreference = 'Continue'",
    `$env:${MANAGER_ELEVATED_RUN_ENV} = '1'`,
    `$target = '${quote(scriptPath)}'`,
    `$log = '${quote(logPath)}'`,
    `$codeFile = '${quote(codePath)}'`,
    '& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $target *>&1 | Out-File -FilePath $log -Encoding utf8',
    '$code = $LASTEXITCODE',
    'if ($null -eq $code) { $code = 0 }',
    'Set-Content -LiteralPath $codeFile -Value $code -Encoding ascii',
    'exit 0',
    '',
  ].join('\r\n')
  await fs.writeFile(runnerPath, runner, 'ascii')

  const command = [
    "$ErrorActionPreference = 'Stop'",
    `$runner = '${quote(runnerPath)}'`,
    `$codeFile = '${quote(codePath)}'`,
    `$log = '${quote(logPath)}'`,
    "$arguments = '-NoProfile -ExecutionPolicy Bypass -File \"' + $runner + '\"'",
    "try { Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WorkingDirectory '" +
      quote(workingDirectory) +
      "' -Verb RunAs -WindowStyle Normal -Wait | Out-Null } catch { Write-Output $_.Exception.Message; exit 1223 }",
    "if (-not (Test-Path -LiteralPath $codeFile)) { Write-Output 'O processo elevado nao gravou codigo de saida. Confirme o prompt do Controle de Conta de Usuario (Administrador).'; exit 1223 }",
    'if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Raw }',
    '$codeText = (Get-Content -LiteralPath $codeFile -Raw).Trim()',
    "if ($codeText -notmatch '^\\d+$') { Write-Output ('Codigo de saida do processo elevado: ' + $codeText); exit 1 }",
    'exit ([int]$codeText)',
  ].join('; ')

  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: false, timeout: 300_000, maxBuffer: 4 * 1024 * 1024 },
    )
    return { ok: true, output: `${stdout}\n${stderr}`.trim(), exitCode: 0 }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string; code?: number }
    const output = `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`.trim()
    return {
      ok: false,
      output,
      exitCode: typeof err.code === 'number' ? err.code : null,
    }
  }
}
