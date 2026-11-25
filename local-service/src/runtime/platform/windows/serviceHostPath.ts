import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function getServiceHostScriptPath(): string {
  if (process.env.SM_SERVICE_HOST_SCRIPT) {
    return process.env.SM_SERVICE_HOST_SCRIPT
  }

  if (typeof __dirname === 'string') {
    const bundled = path.join(__dirname, 'service-host.cjs')
    if (fs.existsSync(bundled)) {
      return bundled
    }
    return bundled
  }

  for (const candidate of [
    path.resolve(process.cwd(), 'dist-local-service', 'service-host.cjs'),
    path.resolve(process.cwd(), '..', 'dist-local-service', 'service-host.cjs'),
  ]) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'serviceHostMain.ts')
}

export function getRuntimeNodeExecutablePath(): string {
  if (process.env.SM_NODE_PATH) {
    return process.env.SM_NODE_PATH
  }
  return process.execPath
}
