import fs from 'node:fs/promises'
import path from 'node:path'

export async function applyProjectEnvironmentTemplate(
  projectDir: string,
): Promise<{ applied: boolean; message: string }> {
  const envPath = path.join(projectDir, '.env')
  const examplePath = path.join(projectDir, '.env.example')

  try {
    await fs.access(envPath)
    return { applied: false, message: 'Arquivo .env já existia — mantido.' }
  } catch {
    // continue
  }

  try {
    await fs.access(examplePath)
  } catch {
    return { applied: false, message: 'Nenhum .env.example — variáveis não aplicadas automaticamente.' }
  }

  await fs.copyFile(examplePath, envPath)
  return {
    applied: true,
    message: 'Arquivo .env criado a partir de .env.example (revise valores sensíveis se o app não subir).',
  }
}
