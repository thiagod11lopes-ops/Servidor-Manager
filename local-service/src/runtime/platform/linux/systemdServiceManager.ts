import type { ServiceActionResponse } from '../../service/types.ts'

function unsupported(): ServiceActionResponse {
  return {
    ok: false,
    message: 'Serviço systemd será implementado em uma etapa futura (Linux).',
    code: 'UNSUPPORTED_PLATFORM',
  }
}

export const linuxSystemdServiceManager = {
  install: async () => unsupported(),
  uninstall: async () => unsupported(),
  start: async () => unsupported(),
  stop: async () => unsupported(),
  restart: async () => unsupported(),
  getStatus: async () => unsupported(),
  setStartup: async () => unsupported(),
}
