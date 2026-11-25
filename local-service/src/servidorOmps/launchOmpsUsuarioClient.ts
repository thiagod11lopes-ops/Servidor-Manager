import { spawn } from 'node:child_process'
import { resolveOmpsUsuarioClientExecutable } from './resolveOmpsUsuarioClientExecutable.ts'

export type LaunchOmpsUsuarioClientResult =
  | { ok: true; executable: string; startUrl: string }
  | { ok: false; message: string }

export function launchOmpsUsuarioClient(startUrl: string): LaunchOmpsUsuarioClientResult {
  const loginUrl = startUrl.trim()
  if (!loginUrl) {
    return { ok: false, message: 'URL de acesso vazia — não foi possível abrir o OMPS Usuário.' }
  }

  const executable = resolveOmpsUsuarioClientExecutable()
  if (!executable) {
    return {
      ok: false,
      message:
        'AcompOPMS.exe (OMPS Usuário) não encontrado no pacote Servidor OMPS. Defina OMPS_USUARIO_CLIENT_EXE ou inclua resources/omps-usuario-client/.',
    }
  }

  try {
    const child = spawn(executable, [], {
      env: {
        ...process.env,
        ACOMOPMS_START_URL: loginUrl,
      },
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return { ok: true, executable, startUrl: loginUrl }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `Falha ao iniciar OMPS Usuário: ${detail}` }
  }
}
