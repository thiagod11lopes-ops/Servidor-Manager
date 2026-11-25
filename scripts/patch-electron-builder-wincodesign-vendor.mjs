/**
 * winCodeSign via vendor/ (7z sem -snld) — evita symlink darwin no cache electron-builder.
 * Usado quando signAndEditExecutable=true no Manager genérico (package:dir).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'node_modules', 'app-builder-lib', 'out', 'codeSign', 'windowsSignToolManager.js')
const MARKER = 'OMPS_WINCODESIGN_VENDOR'

const patchedBody = `function getSignVendorPath() {
    /* ${MARKER} */
    const fs = require("fs");
    const path = require("path");
    const override = process.env.OMPS_WINCODESIGN_VENDOR;
    if (override && fs.existsSync(override)) {
        return Promise.resolve(override);
    }
    const candidates = [
        path.resolve(__dirname, "..", "..", "..", "..", "vendor", "winCodeSign"),
        path.resolve(__dirname, "..", "..", "..", "vendor", "winCodeSign"),
        path.resolve(process.cwd(), "vendor", "winCodeSign"),
    ];
    for (const repoVendor of candidates) {
        if (fs.existsSync(path.join(repoVendor, "rcedit-x64.exe"))) {
            return Promise.resolve(repoVendor);
        }
    }
    return (0, binDownload_1.getBin)("winCodeSign");
}`

const src = fs.readFileSync(target, 'utf8')
const fnRe = /function getSignVendorPath\(\) \{[\s\S]*?\n\}/
if (!fnRe.test(src)) {
  console.error('patch-wincodesign-vendor: getSignVendorPath não encontrado — revisar app-builder-lib.')
  process.exit(1)
}
const next = src.replace(fnRe, patchedBody)
if (next === src && src.includes(MARKER) && src.includes('repoVendor')) {
  console.log('patch-wincodesign-vendor: já aplicado (vendor automático).')
  process.exit(0)
}
fs.writeFileSync(target, next)
console.log('patch-wincodesign-vendor: OK (vendor/winCodeSign automático quando presente)')
