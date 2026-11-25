import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runControlledCommand } from '../installation/runControlledCommand.ts'
import { resolveServidorEnvPaths } from './prepareServidorEnv.ts'
import type { ServerManifest } from './types.ts'

const LINUX_FIREWALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail
HTTP_PORT="\${1:-8080}"
if command -v ufw >/dev/null 2>&1; then
  if [[ "\${EUID:-0}" -ne 0 ]]; then
    echo "ufw disponível — execute com sudo para aplicar: sudo bash \\"\\$0\\" \${HTTP_PORT}"
    echo "Até lá, clientes LAN podem não alcançar a porta \${HTTP_PORT}."
    exit 0
  fi
  ufw allow "\${HTTP_PORT}/tcp" comment 'AcompOPMS Caddy LAN (Manager)' || true
  ufw status numbered || true
  echo "Regra ufw allow \${HTTP_PORT}/tcp aplicada."
  exit 0
fi
echo "ufw não encontrado. Abra \${HTTP_PORT}/tcp manualmente (firewalld/iptables/nftables)."
exit 0
`

async function readHttpPort(rootDirectory: string, manifest: ServerManifest): Promise<number> {
  const paths = resolveServidorEnvPaths(rootDirectory, manifest)
  try {
    const raw = await fs.readFile(paths.envPath, 'utf8')
    const match = raw.match(/^\s*ACOMOPMS_HTTP_PORT\s*=\s*(\d+)/m)
    if (match) return Number.parseInt(match[1], 10)
  } catch {
    // ignore
  }
  return 8080
}

export async function runEnsureLanFirewallLinux(input: {
  rootDirectory: string
  manifest: ServerManifest
}): Promise<{ ok: boolean; output: string }> {
  const httpPort = await readHttpPort(input.rootDirectory, input.manifest)
  const tempScript = path.join(os.tmpdir(), `servidor-manager-lan-fw-${process.pid}.sh`)
  await fs.writeFile(tempScript, LINUX_FIREWALL_SCRIPT, { encoding: 'utf8', mode: 0o755 })

  try {
    const result = await runControlledCommand(
      { executable: 'bash', args: [tempScript, String(httpPort)], label: 'manager.lan-firewall-linux' },
      input.rootDirectory,
    )
    return { ok: result.ok, output: result.output }
  } finally {
    await fs.rm(tempScript, { force: true })
  }
}
