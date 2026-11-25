import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Windows: `start "" "path"` cria processo independente (sobrevive ao exit do hub Electron).
 * Evita PowerShell “aguardar pai” morto junto com app.exit(0).
 */
export function buildWindowsDetachedStartArgs(exePath) {
  const comspec = process.env.ComSpec || 'cmd.exe'
  return {
    file: comspec,
    args: ['/d', '/s', '/c', 'start', '""', exePath],
  }
}

/**
 * @param {string} exePath
 * @returns {Promise<{ ok: true, pid: number } | { ok: false, message: string }>}
 */
export function launchWindowsSubinstaller(exePath) {
  if (!exePath || !String(exePath).trim()) {
    return Promise.resolve({ ok: false, message: 'Caminho do subinstalador vazio.' })
  }
  if (!existsSync(exePath)) {
    return Promise.resolve({
      ok: false,
      message: `Subinstalador não encontrado:\n${exePath}`,
    })
  }

  const { file, args } = buildWindowsDetachedStartArgs(exePath)

  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const child = spawn(file, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    })

    child.once('error', (err) => {
      finish({
        ok: false,
        message: `Não foi possível iniciar o subinstalador: ${err.message}`,
      })
    })

    child.once('spawn', () => {
      if (!child.pid) {
        finish({ ok: false, message: 'Falha ao criar processo do subinstalador (sem PID).' })
        return
      }
      child.unref()
      finish({ ok: true, pid: child.pid })
    })
  })
}
