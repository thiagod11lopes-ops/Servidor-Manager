/**
 * InstallLocation órfão (registro sem binários) não deve vazar caminho de teste no NSIS compilado.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const nshPath = join(root, 'desktop', 'installer-servidor-omps.nsh')

const TEST_PATH_MARKERS = [
  'OMPS-Validacao-Servidor-HubOpen',
  'OMPS-Test-Hub-Agent',
  'OMPS-CleanReg-Test',
  'C:\\OMPS-Validacao',
]

test('installer-servidor-omps.nsh ignora InstallLocation órfão em customInit', () => {
  const nsh = readFileSync(nshPath, 'utf8')
  assert.match(nsh, /!macro customInit/)
  assert.match(nsh, /StdUtils\.GetParameter.*"D"/)
  assert.match(nsh, /\$\{PRODUCT_FILENAME\}\.exe/)
  assert.match(nsh, /Programs\\\$\{APP_FILENAME\}/)
})

test('artefatos release não embutem caminhos de teste conhecidos', () => {
  const artifacts = [
    join(root, 'release', 'servidor-omps', 'Servidor OMPS.exe'),
    join(root, 'release', 'omps-unified', 'Servidor OMPS.exe'),
    join(root, 'release', 'omps-unified', 'OMPS Usuario.exe'),
    join(root, 'release', 'omps-hub', 'Instalar OMPS.exe'),
    join(root, 'release', 'omps-hub', 'win-unpacked', 'resources', 'subinstallers', 'servidor-omps', 'Servidor OMPS.exe'),
  ].filter((p) => existsSync(p))

  if (artifacts.length === 0) {
    console.log('[skip] artefatos release ausentes')
    return
  }

  for (const file of artifacts) {
    const buf = readFileSync(file)
    const text = buf.toString('latin1')
    for (const marker of TEST_PATH_MARKERS) {
      assert.equal(
        text.includes(marker),
        false,
        `${file} contém caminho de teste embutido: ${marker}`,
      )
    }
  }
})
