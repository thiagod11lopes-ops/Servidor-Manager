/**
 * Contrato do payload OMPS em Servidor OMPS.exe (servidor-omps-bundle/1).
 * Usado por build-omps-payload.mjs e testes.
 */

/** Pastas na raiz do checkout OMPS incluídas integralmente (salvo filtros globais). */
export const OMPS_PAYLOAD_INCLUDE_TOP_LEVEL = [
  'server-manifest.json',
  'supabase',
  'frontend',
  'Transferir para Servidor',
  'schemas',
]

/** Pastas/arquivos na raiz explicitamente excluídos. */
export const OMPS_PAYLOAD_EXCLUDE_TOP_LEVEL = [
  '.git',
  '.github',
  '.cursor',
  'Instalador OPMS',
  'docs',
  'scripts',
  'node_modules',
]

/** Segmentos de caminho excluídos em qualquer profundidade (normalizado /). */
export const OMPS_PAYLOAD_EXCLUDE_PATH_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
])

/** Sufixos / nomes de arquivo sensíveis ou de dev (não enviar no payload). */
export const OMPS_PAYLOAD_EXCLUDE_FILE_NAMES = new Set([
  '.env',
  'connection.json',
])

/** Caminhos relativos obrigatórios após empacotamento. */
export const OMPS_PAYLOAD_REQUIRED_PATHS = [
  'server-manifest.json',
  'supabase/config.toml',
  'frontend/package.json',
  'Transferir para Servidor/aplicar-schema-local.sh',
  'schemas/server-manifest.schema.json',
  'schemas/package.json',
]

/** Caminhos que não devem existir no payload. */
export const OMPS_PAYLOAD_FORBIDDEN_PATHS = [
  'Instalador OPMS',
  'frontend/dist/index.html',
  '.git/config',
]

export const DEFAULT_OMPS_SOURCE_RELATIVE = 'AcompSolemp-cursor-servidor-lan-etapa16-bcc8'

export const LOCK_SCHEMA = 'omps-payload-source-lock/1'
export const BUNDLE_META_SCHEMA = 'servidor-omps-bundle/1'
