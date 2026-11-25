import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, it } from 'node:test'
import { usesWindowsShellWrapper } from '../installation/windowsCommands.ts'
import { runSupabase } from './supabaseLocalCommands.ts'

const execFileAsync = promisify(execFile)

describe('runSupabase — Windows cmd wrapper', () => {
  it('marca supabase para wrapper no win32', () => {
    if (process.platform !== 'win32') return
    assert.equal(usesWindowsShellWrapper('supabase'), true)
  })

  it('execFile direto em supabase falha no win32 (shim npm .cmd)', async () => {
    if (process.platform !== 'win32') return

    await assert.rejects(
      () =>
        execFileAsync('supabase', ['--version'], {
          windowsHide: true,
          timeout: 15_000,
          env: { ...process.env },
        }),
      (error: NodeJS.ErrnoException) => {
        assert.match(error.message ?? '', /ENOENT|not found/i)
        return true
      },
    )
  })

  it('runSupabase executa --version sem Docker via runControlledCommand', async () => {
    if (process.platform !== 'win32') return

    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-supabase-cli-'))
    const result = await runSupabase(['--version'], cwd)

    assert.equal(result.ok, true)
    assert.match(result.output, /\d+\.\d+/)
    assert.equal(result.label, 'supabase --version')
  })
})
