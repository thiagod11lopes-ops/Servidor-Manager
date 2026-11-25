/**
 * Hook NSIS: customBeforeCopyInstalledFiles antes de CopyFiles (extractUsing7za).
 * Usado pelo hub OMPS para encerrar instância instalada antes da extração 7z (~metade da barra).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(
  root,
  'node_modules',
  'app-builder-lib',
  'templates',
  'nsis',
  'include',
  'extractAppPackage.nsh',
)

const MARKER = 'SM_PATCH_CUSTOM_BEFORE_COPY'

const hookBlock = `    !ifmacrodef customBeforeCopyInstalledFiles
      !insertmacro customBeforeCopyInstalledFiles
    !endif
`

const anchor = '    # Attempt to copy files in atomic way\n    CopyFiles /SILENT "$PLUGINSDIR\\7z-out\\*" $OUTDIR'

const patchedAnchor = `${hookBlock}    # Attempt to copy files in atomic way
    CopyFiles /SILENT "$PLUGINSDIR\\7z-out\\*" $OUTDIR`

const retryAnchor = '  RetryExtract7za:\n    Sleep 1000'
const patchedRetry = `  RetryExtract7za:
${hookBlock}    Sleep 1000`

if (!fs.existsSync(target)) {
  console.error(`patch-nsis-before-copy: ausente ${target}`)
  process.exit(1)
}

let source = fs.readFileSync(target, 'utf8')
if (source.includes(MARKER)) {
  console.log('patch-nsis-before-copy: já aplicado.')
  process.exit(0)
}

if (!source.includes(anchor)) {
  console.error('patch-nsis-before-copy: anchor CopyFiles não encontrado — template electron-builder mudou?')
  process.exit(1)
}

source = source.replace(anchor, `    ; ${MARKER}\n${patchedAnchor}`)
source = source.replace(retryAnchor, `  RetryExtract7za:\n    ; ${MARKER} retry\n${hookBlock}    Sleep 1000`)

fs.writeFileSync(target, source, 'utf8')
console.log('patch-nsis-before-copy: hook customBeforeCopyInstalledFiles aplicado em extractAppPackage.nsh')
