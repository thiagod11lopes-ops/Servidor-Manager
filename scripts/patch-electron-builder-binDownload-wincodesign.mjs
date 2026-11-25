/**
 * Intercepta getBin/getBinFromUrl("winCodeSign*") → vendor/winCodeSign local (sem 7z -snld).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'node_modules', 'app-builder-lib', 'out', 'binDownload.js')
const MARKER = 'OMPS_WINCODESIGN_BIN'

const helper = `
function ${MARKER}_resolveRepoWinCodeSignVendor() {
    const fs = require("fs");
    const path = require("path");
    const override = process.env.OMPS_WINCODESIGN_VENDOR;
    if (override && fs.existsSync(override)) {
        return override;
    }
    const candidates = [
        path.resolve(__dirname, "..", "..", "..", "vendor", "winCodeSign"),
        path.resolve(__dirname, "..", "..", "..", "..", "vendor", "winCodeSign"),
        path.resolve(process.cwd(), "vendor", "winCodeSign"),
    ];
    for (const repoVendor of candidates) {
        if (fs.existsSync(path.join(repoVendor, "rcedit-x64.exe"))) {
            return repoVendor;
        }
    }
    return null;
}
function ${MARKER}_localWinCodeSignOrNull(name) {
    if (name === "winCodeSign" || (typeof name === "string" && name.startsWith("winCodeSign"))) {
        return ${MARKER}_resolveRepoWinCodeSignVendor();
    }
    return null;
}
`

let src = fs.readFileSync(target, 'utf8')
if (!src.includes(MARKER)) {
  src = src.replace(
    'const versionToPromise = new Map();',
    `const versionToPromise = new Map();\n${helper}`,
  )
}

const getBinNeedle = `function getBin(name, url, checksum) {
    // Old cache is ignored if cache environment variable changes
    const cacheName = \`\${process.env.ELECTRON_BUILDER_CACHE}\${name}\`;`

const getBinPatched = `function getBin(name, url, checksum) {
    const localVendor = ${MARKER}_localWinCodeSignOrNull(name);
    if (localVendor) {
        return Promise.resolve(localVendor);
    }
    // Old cache is ignored if cache environment variable changes
    const cacheName = \`\${process.env.ELECTRON_BUILDER_CACHE}\${name}\`;`

if (!src.includes(`${MARKER}_localWinCodeSignOrNull(name)`)) {
  if (!src.includes(getBinNeedle)) {
    console.error('patch-binDownload-wincodesign: getBin não encontrado.')
    process.exit(1)
  }
  src = src.replace(getBinNeedle, getBinPatched)
}

const fromUrlNeedle = `function getBinFromUrl(name, version, checksum) {
    const dirName = \`\${name}-\${version}\`;`

const fromUrlPatched = `function getBinFromUrl(name, version, checksum) {
    const localVendor = ${MARKER}_localWinCodeSignOrNull(name);
    if (localVendor) {
        return Promise.resolve(localVendor);
    }
    const dirName = \`\${name}-\${version}\`;`

if (!src.includes('getBinFromUrl(name, version, checksum) {\n    const localVendor')) {
  if (!src.includes(fromUrlNeedle)) {
    console.error('patch-binDownload-wincodesign: getBinFromUrl não encontrado.')
    process.exit(1)
  }
  src = src.replace(fromUrlNeedle, fromUrlPatched)
}

fs.writeFileSync(target, src)
console.log('patch-binDownload-wincodesign: OK')
