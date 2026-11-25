import { runServiceHost } from '../runtime/platform/windows/serviceHostMain.ts'

function parseSystemId(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith('--system-id=')) {
      return arg.slice('--system-id='.length)
    }
  }
  return null
}

const systemId = parseSystemId(process.argv.slice(2))
if (!systemId) {
  console.error('Informe --system-id=<uuid>')
  process.exit(1)
}

runServiceHost(systemId)
  .then((code) => process.exit(code))
  .catch(() => process.exit(1))
