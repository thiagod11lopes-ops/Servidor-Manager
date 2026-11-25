/**
 * Windows (build): após makensis BUILD_UNINSTALLER, gera __uninstaller-* executando o stub
 * NSIS (WriteUninstaller) — mesmo fluxo que electron-builder upstream via execWine.
 * NÃO usar UninstallerReader no Windows: extração stub+inner gera desinstalador inválido (CRC NSIS).
 *
 * macOS Catalina+: UninstallerReader como upstream.
 *
 * Idempotente — SM_PATCH_NSIS_WIN_EXEC_WRITE_UNINSTALLER.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(
  root,
  'node_modules',
  'app-builder-lib',
  'out',
  'targets',
  'nsis',
  'NsisTarget.js',
)

const MARKER = 'SM_PATCH_NSIS_WIN_EXEC_WRITE_UNINSTALLER'
const LEGACY_MARKERS = [
  'SM_PATCH_NSIS_WIN_MAKENSIS_UNINSTALLER',
  'SM_PATCH_NSIS_UNINSTALLER_READER',
]

const patchedBlock = `        /* ${MARKER} */
        if ((0, macosVersion_1.isMacOsCatalina)()) {
            try {
                await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
            }
            catch (error) {
                builder_util_1.log.warn(\`packager.vm is used: \${error.message}\`);
                const vm = await packager.vm.value;
                await vm.exec(installerPath, []);
                let i = 0;
                while (!(await (0, builder_util_2.exists)(uninstallerPath)) && i++ < 100) {
                    await new Promise((resolve, _reject) => setTimeout(resolve, 300));
                }
            }
        }
        else if (process.platform === "win32") {
            await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
            let _smWait = 0;
            let _smLastSize = 0;
            while (_smWait++ < 120) {
                if (await (0, builder_util_2.exists)(uninstallerPath)) {
                    const _st = await (0, fs_extra_1.stat)(uninstallerPath);
                    if (_st.size > 0 && _st.size === _smLastSize && _st.size >= 165000) {
                        break;
                    }
                    _smLastSize = _st.size;
                }
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            if (!(await (0, builder_util_2.exists)(uninstallerPath))) {
                throw new Error(\`NSIS uninstaller stub não gerado: \${uninstallerPath}\`);
            }
            const { pathToFileURL } = require("url");
            const { validateNsisUninstallerArtifact } = await import(pathToFileURL(require("path").join(process.cwd(), "scripts", "nsis-uninstaller-artifact.mjs")).href);
            await validateNsisUninstallerArtifact(uninstallerPath);
        }
        else {
            await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
        }`

const postSignValidate = `        await packager.sign(uninstallerPath);
        /* SM_VALIDATE_NSIS_UNINSTALLER_AFTER_SIGN */
        if (process.platform === "win32") {
            const { pathToFileURL } = require("url");
            const { validateNsisUninstallerArtifact } = await import(pathToFileURL(require("path").join(process.cwd(), "scripts", "nsis-uninstaller-artifact.mjs")).href);
            await validateNsisUninstallerArtifact(uninstallerPath);
        }`

const auditUnlinkPatch = `        /* SM_PATCH_NSIS_UNINSTALLER_AUDIT */
        await packager.sign(installerPath);
        if (defines.UNINSTALLER_OUT_FILE != null) {
            const _smAuditUninstaller = path.join(this.outDir, \`__uninstaller-audit-\${this.packager.appInfo.sanitizedName}.exe\`);
            await (0, fs_extra_1.copyFile)(defines.UNINSTALLER_OUT_FILE, _smAuditUninstaller);
            await (0, fs_extra_1.unlink)(defines.UNINSTALLER_OUT_FILE);
        }`

if (!fs.existsSync(target)) {
  console.error(`patch-nsis: arquivo não encontrado: ${target}`)
  process.exit(1)
}

let source = fs.readFileSync(target, 'utf8')

if (
  source.includes(MARKER) &&
  source.includes('SM_PATCH_NSIS_UNINSTALLER_AUDIT') &&
  source.includes('SM_VALIDATE_NSIS_UNINSTALLER_AFTER_SIGN')
) {
  console.log('patch-nsis: já aplicado (Windows WriteUninstaller + audit + validação).')
  process.exit(0)
}

const signUnlinkRe =
  /await Promise\.all\(\[packager\.sign\(installerPath\), defines\.UNINSTALLER_OUT_FILE == null \? Promise\.resolve\(\) : \(0, fs_extra_1\.unlink\)\(defines\.UNINSTALLER_OUT_FILE\)\]\);/

const blockStart = source.search(/\/\* SM_PATCH_NSIS_/)
const signUninstallerIdx = source.indexOf('await packager.sign(uninstallerPath);', blockStart >= 0 ? blockStart : 0)

if (signUninstallerIdx < 0) {
  console.error('patch-nsis: await packager.sign(uninstallerPath) não encontrado.')
  process.exit(1)
}

if (blockStart >= 0) {
  const before = source.slice(0, blockStart)
  const after = source.slice(signUninstallerIdx)
  source = before + patchedBlock + '\n        ' + after.replace(/^        await packager\.sign\(uninstallerPath\);/, postSignValidate)
} else {
  const upstreamRe =
    /\/\/ http:\/\/forums\.winamp\.com\/showthread\.php\?p=3078545[\s\S]*?await packager\.sign\(uninstallerPath\);/
  if (!upstreamRe.test(source)) {
    console.error('patch-nsis: bloco computeScriptAndSignUninstaller não reconhecido.')
    process.exit(1)
  }
  source = source.replace(upstreamRe, patchedBlock + '\n        await packager.sign(uninstallerPath);')
}

if (signUnlinkRe.test(source)) {
  source = source.replace(signUnlinkRe, auditUnlinkPatch)
} else if (!source.includes('SM_PATCH_NSIS_UNINSTALLER_AUDIT')) {
  console.error('patch-nsis: trecho unlink UNINSTALLER_OUT_FILE não reconhecido.')
  process.exit(1)
}

for (const leg of LEGACY_MARKERS) {
  if (source.includes(leg) && leg !== MARKER) {
    source = source.replace(new RegExp(`/\\* ${leg} \\*/`, 'g'), `/* ${leg} (substituído) */`)
  }
}

fs.writeFileSync(target, source, 'utf8')
console.log('patch-nsis: Windows usa WriteUninstaller (execWine), validação offline e cópia audit.')
