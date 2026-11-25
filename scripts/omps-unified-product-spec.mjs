/**
 * Contrato do produto futuro OMPS.exe (instalador unificado Servidor + Cliente).
 * Somente metadados e validação — build NSIS final não está ligado a npm scripts.
 */

/** NSIS / electron-builder do hub unificado (futuro). */
export const OMPS_UNIFIED_APP_ID = 'com.servidor.omps.unified'
export const OMPS_UNIFIED_PRODUCT_NAME = 'OMPS'
/** NSIS do hub (legado/dev — não é ponto de entrada da distribuição final). */
export const OMPS_UNIFIED_NSIS_ARTIFACT = 'Instalar OMPS.${ext}'
export const OMPS_UNIFIED_NSIS_EXE_WIN = 'Instalar OMPS.exe'
export const OMPS_HUB_BUILD_OUTPUT_DIR = 'release/omps-hub'
/** @deprecated use OMPS_HUB_BUILD_OUTPUT_DIR */
export const OMPS_UNIFIED_BUILD_OUTPUT_DIR = OMPS_HUB_BUILD_OUTPUT_DIR
/** Distribuição final: dois instaladores NSIS independentes na raiz. */
export const OMPS_UNIFIED_DISTRIBUTION_DIR = 'release/omps-unified'
export const OMPS_UNIFIED_DISTRIBUTION_MANIFEST = 'omps-unified-distribution.json'
export const OMPS_UNIFIED_BUNDLE_DIR = 'release/omps-unified-bundle'
export const OMPS_UNIFIED_MANIFEST_FILENAME = 'omps-unified-manifest.json'
export const OMPS_UNIFIED_RESOURCES_SUBINSTALLERS = 'subinstallers'

/** Relativos dentro de resources/subinstallers/ após prepare. */
export const SERVER_SUBINSTALLER_NSIS_REL = 'servidor-omps/Servidor OMPS.exe'
export const SERVER_SUBINSTALLER_DIR_REL = 'servidor-omps/win-unpacked'
export const CLIENT_SUBINSTALLER_DIR_REL = 'cliente'
export const CLIENT_SUBINSTALLER_NSIS_REL = 'cliente/OMPS Usuario.exe'
export const CLIENT_SUBINSTALLER_NSIS_FILENAME = 'OMPS Usuario.exe'
/** Wizard portable legado (dev); fallback opcional no hub. */
export const CLIENT_SUBINSTALLER_EXE_PREFIX = 'AcompOPMS-Instalador-'

/** Variante Servidor OMPS (Manager + payload) — já implementada. */
export const SERVIDOR_OMPS_APP_ID = 'com.servidor.omps'
export const SERVIDOR_OMPS_NSIS_ARTIFACT = 'Servidor OMPS.${ext}'
export const SERVIDOR_OMPS_BUILD_OUTPUT_DIR = 'release/servidor-omps'

/** Manager genérico — inalterado. */
export const GENERIC_MANAGER_APP_ID = 'com.servidor.manager'
export const GENERIC_MANAGER_NSIS_ARTIFACT = 'servidor.${ext}'

/** Cliente AcompOPMS — wizard portable (Instalador OPMS/instalador). */
export const CLIENT_INSTALLER_APP_ID = 'br.marinha.acompopms.instalador'
export const CLIENT_INSTALLER_PORTABLE_ARTIFACT = 'AcompOPMS-Instalador-${version}-win-x64.${ext}'
export const CLIENT_INSTALLED_EXE = 'AcompOPMS.exe'

/** OMPS Usuário — NSIS independente (cliente Electron + rede fixa). */
export const OMPS_USUARIO_APP_ID = 'com.servidor.omps.usuario'
export const OMPS_USUARIO_NSIS_ARTIFACT = 'OMPS Usuario.${ext}'
export const OMPS_USUARIO_BUILD_OUTPUT_DIR = 'release/omps-usuario'

/** Diretórios de dados / instalação (não devem colidir). */
export const SERVER_USER_DATA_ROOT_WIN = 'C:\\ServidorManager'
export const CLIENT_INSTALL_DIR_WIN = '%LOCALAPPDATA%\\AcompOPMS'
export const SERVER_PROGRAM_DEFAULT_WIN = '%LOCALAPPDATA%\\Programs\\ServidorManager'

/** Caminho relativo ao workspace OMPS (vendored) do instalador cliente. */
export const OMPS_CLIENT_INSTALLER_RELATIVE = 'AcompSolemp-cursor-servidor-lan-etapa16-bcc8/Instalador OPMS/instalador'

/** Escolhas apresentadas ao usuário no hub unificado. */
export const OMPS_UNIFIED_CHOICES = Object.freeze({
  SERVER: 'install-omps-server',
  CLIENT: 'install-omps-client',
})

/** Componentes empacotados por escolha (contrato lógico). */
export const OMPS_UNIFIED_COMPONENTS = Object.freeze({
  [OMPS_UNIFIED_CHOICES.SERVER]: Object.freeze({
    id: 'servidor-omps-manager',
    description: 'Servidor OMPS (Manager runtime) + payload omps-payload + first-run /servidor-omps',
    usesExistingBuild: 'electron-builder.servidor-omps.yml',
    payloadSchema: 'servidor-omps-bundle/1',
    requiresGitHubAtRuntime: false,
  }),
  [OMPS_UNIFIED_CHOICES.CLIENT]: Object.freeze({
    id: 'omps-usuario-desktop',
    description: 'OMPS Usuário — NSIS independente (electron-builder.omps-usuario.yml)',
    usesExistingBuild: 'electron-builder.omps-usuario.yml',
    requiresGitHubAtRuntime: false,
    requiresServerUrl: false,
  }),
})
