import { appendLocalServiceDiagnostic } from './installationDiagnosticLog.ts'

let registered = false

export function registerLocalServiceProcessGuards(): void {
  if (registered) return
  registered = true

  process.on('uncaughtException', (error) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    void appendLocalServiceDiagnostic('uncaughtException', message)
  })

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    void appendLocalServiceDiagnostic('unhandledRejection', message)
  })
}
