import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const updatesPath = path.join(root, 'public', 'cursor-updates.json')
const brandPath = path.join(root, 'public', 'manager-brand.json')

const ompsBrand = process.argv.includes('--omps')
const displayName = ompsBrand
  ? 'Servidor OMPS'
  : process.env.MANAGER_PRODUCT_DISPLAY_NAME?.trim() || 'Servidor Manager'
const productLine = displayName === 'Servidor OMPS' ? 'servidor-omps' : 'servidor-manager'

let manifest = { currentVersion: pkg.version, lastBuiltAt: null, entries: [] }
if (fs.existsSync(updatesPath)) {
  manifest = JSON.parse(fs.readFileSync(updatesPath, 'utf8'))
}

manifest.currentVersion = pkg.version
manifest.lastBuiltAt = new Date().toISOString()

fs.writeFileSync(updatesPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
fs.writeFileSync(
  brandPath,
  `${JSON.stringify({ displayName, productLine, version: pkg.version, lastBuiltAt: manifest.lastBuiltAt }, null, 2)}\n`,
  'utf8',
)
console.log(`cursor-updates.json: versão ${pkg.version}, lastBuiltAt=${manifest.lastBuiltAt}`)
console.log(`manager-brand.json: displayName=${displayName}`)
