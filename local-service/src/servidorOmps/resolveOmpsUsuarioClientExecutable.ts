import fs from 'node:fs'
import path from 'node:path'
import { getManagerInstallRoot } from '../bundledOmps/managerInstallRoot.ts'

const CLIENT_EXE = 'AcompOPMS.exe'

/** Cliente OMPS Usuário embutido no Servidor OMPS (não é cadastro em Meus Sistemas). */
export function resolveOmpsUsuarioClientExecutable(): string | null {
  const fromEnv = process.env.OMPS_USUARIO_CLIENT_EXE?.trim()
  if (fromEnv && fs.existsSync(fromEnv)) return path.resolve(fromEnv)

  const installRoot = getManagerInstallRoot()
  if (installRoot) {
    const candidates = [
      path.join(installRoot, 'resources', 'omps-usuario-client', CLIENT_EXE),
      path.join(installRoot, 'resources', 'omps-usuario', CLIENT_EXE),
      path.join(installRoot, 'AcompOPMS.exe'),
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
  }

  const localAppData = process.env.LOCALAPPDATA?.trim()
  if (localAppData) {
    const legacy = path.join(localAppData, 'AcompOPMS', CLIENT_EXE)
    if (fs.existsSync(legacy)) return legacy
  }

  return null
}
