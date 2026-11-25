import { buildAllowedOrigins, parseServicePort } from './runtime/managerRuntimeConfig.ts'

export const SERVICE_HOST = '127.0.0.1'
export const SERVICE_PORT = parseServicePort()

export const ALLOWED_ORIGINS = buildAllowedOrigins()
