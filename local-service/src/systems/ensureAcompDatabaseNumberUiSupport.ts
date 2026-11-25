import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PATCH_MARKER = 'servidor-manager-database-number-ui'

const HOOK_REL = 'frontend/src/hooks/useDatabaseNumberFromConnection.ts'
const BADGE_REL = 'frontend/src/components/common/DatabaseNumberBadge.tsx'
const TOP_BAR_REL = 'frontend/src/layouts/TopBar.tsx'
const BUILD_CONNECTION_REL = 'Transferir para Servidor/servidor-lan/lib/build-server-connection.mjs'

const HOOK_SOURCE = `import { useEffect, useState } from 'react'

/** Lê databaseNumber de /server-connection.json (gerenciado pelo Servidor Manager). */
export function useDatabaseNumberFromConnection(): string | null {
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/server-connection.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { databaseNumber?: unknown } | null) => {
        if (cancelled || !body) return
        const value =
          typeof body.databaseNumber === 'string' ? body.databaseNumber.trim().toUpperCase() : ''
        if (value) setCode(value)
      })
      .catch(() => {
        // offline / Caddy parado
      })
    return () => {
      cancelled = true
    }
  }, [])

  return code
}
`

const BADGE_SOURCE = `import { Box, Typography } from '@mui/material'
import { useDatabaseNumberFromConnection } from '@/hooks/useDatabaseNumberFromConnection'

/** Badge BNCxx à esquerda do avatar do utilizador (${PATCH_MARKER}). */
export function DatabaseNumberBadge() {
  const code = useDatabaseNumberFromConnection()
  if (!code) return null

  return (
    <Box
      component="span"
      title="Número do banco de dados"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1,
        py: 0.25,
        mr: 0.5,
        borderRadius: 1,
        border: 1,
        borderColor: 'primary.main',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.16)' : 'rgba(25, 118, 210, 0.08)',
      }}
    >
      <Typography
        component="span"
        variant="caption"
        sx={{ fontWeight: 700, letterSpacing: '0.08em', color: 'primary.main' }}
      >
        {code}
      </Typography>
    </Box>
  )
}
`

async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
  try {
    const existing = await fs.readFile(filePath, 'utf8')
    if (existing === content) return false
  } catch {
    // create
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
  return true
}

async function patchTopBar(projectDirectory: string): Promise<boolean> {
  const topBarPath = path.join(projectDirectory, TOP_BAR_REL)
  let raw: string
  try {
    raw = await fs.readFile(topBarPath, 'utf8')
  } catch {
    return false
  }

  if (raw.includes(PATCH_MARKER) || raw.includes('DatabaseNumberBadge')) {
    return false
  }

  let next = raw
  if (!next.includes("from '@/components/common/DatabaseNumberBadge'")) {
    next = next.replace(
      "import { NotificationPanel } from '@/components/notifications/NotificationPanel'",
      "import { NotificationPanel } from '@/components/notifications/NotificationPanel'\nimport { DatabaseNumberBadge } from '@/components/common/DatabaseNumberBadge'",
    )
  }

  const avatarButtonRe =
    /(\s*)<IconButton onClick=\{\(e\) => setAnchorEl\(e\.currentTarget\)\}>\s*\n\s*<Avatar/
  const avatarMatch = avatarButtonRe.exec(next)
  if (!avatarMatch) {
    return false
  }

  const indent = avatarMatch[1] ?? '          '
  next = next.replace(
    avatarButtonRe,
    `{/* ${PATCH_MARKER} */}\n${indent}<DatabaseNumberBadge />\n${indent}<IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>\n${indent}  <Avatar`,
  )

  if (next === raw) return false
  await fs.writeFile(topBarPath, next, 'utf8')
  return true
}

async function patchBuildServerConnection(projectDirectory: string): Promise<boolean> {
  const filePath = path.join(projectDirectory, BUILD_CONNECTION_REL)
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    return false
  }

  if (raw.includes('databaseNumber:') || raw.includes(PATCH_MARKER)) {
    return false
  }

  const needle = "    product: 'AcompOPMS',"
  if (!raw.includes(needle)) return false

  const insert = `    product: 'AcompOPMS',\n    /* ${PATCH_MARKER} */\n    databaseNumber: (cfg.envVars?.ACOMOPMS_DATABASE_NUMBER ?? '').trim() || null,`
  const next = raw.replace(needle, insert)
  if (next === raw) return false
  await fs.writeFile(filePath, next, 'utf8')
  return true
}

async function runGerarServerConnection(projectDirectory: string): Promise<void> {
  const scriptPath = path.join(
    projectDirectory,
    'Transferir para Servidor/servidor-lan/gerar-server-connection.mjs',
  )
  try {
    await fs.access(scriptPath)
  } catch {
    return
  }

  const cwd = path.join(projectDirectory, 'Transferir para Servidor/servidor-lan')
  try {
    await execFileAsync(process.execPath, [scriptPath], {
      cwd,
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch {
    // build script may fail if env incomplete — dist patch still applied elsewhere
  }
}

export async function ensureAcompDatabaseNumberUiSupport(projectDirectory: string): Promise<{
  patched: boolean
}> {
  const hookPath = path.join(projectDirectory, HOOK_REL)
  const badgePath = path.join(projectDirectory, BADGE_REL)

  const wroteHook = await writeIfChanged(hookPath, HOOK_SOURCE)
  const wroteBadge = await writeIfChanged(badgePath, BADGE_SOURCE)
  const patchedTopBar = await patchTopBar(projectDirectory)
  const patchedBuild = await patchBuildServerConnection(projectDirectory)

  await runGerarServerConnection(projectDirectory)

  return {
    patched: wroteHook || wroteBadge || patchedTopBar || patchedBuild,
  }
}
