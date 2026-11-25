/** Espelho de scripts/omps-payload-spec.mjs — algoritmo de integridade deve permanecer idêntico. */

export const BUNDLE_META_SCHEMA = 'servidor-omps-bundle/1'

export const OMPS_PAYLOAD_INCLUDE_TOP_LEVEL = [
  'server-manifest.json',
  'supabase',
  'frontend',
  'Transferir para Servidor',
  'schemas',
] as const

export const OMPS_PAYLOAD_EXCLUDE_PATH_SEGMENTS = new Set(['node_modules', '.git', 'dist'])

export const OMPS_PAYLOAD_EXCLUDE_FILE_NAMES = new Set(['.env', 'connection.json'])

export const OMPS_PAYLOAD_REQUIRED_PATHS = [
  'server-manifest.json',
  'supabase/config.toml',
  'frontend/package.json',
  'Transferir para Servidor/aplicar-schema-local.sh',
  'schemas/server-manifest.schema.json',
  'schemas/package.json',
] as const

export const BUNDLED_PAYLOAD_RESOURCE_DIR = 'omps-payload'
export const BUNDLED_BUNDLE_RESOURCE_DIR = 'omps-bundle'
export const BUNDLED_META_FILE = 'bundle-meta.json'
