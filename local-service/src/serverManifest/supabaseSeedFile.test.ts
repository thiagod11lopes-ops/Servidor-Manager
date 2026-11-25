import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ensureSupabaseSeedFileIfConfigured } from './supabaseLocalIdentity.ts'

test('ensureSupabaseSeedFileIfConfigured cria seed.sql quando referenciado e ausente', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-seed-'))
  const supabaseDir = path.join(root, 'supabase')
  await fs.mkdir(supabaseDir, { recursive: true })
  const config = `[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
`
  const result = await ensureSupabaseSeedFileIfConfigured(root, config)
  assert.equal(result.createdSeed, true)
  const seed = await fs.readFile(path.join(supabaseDir, 'seed.sql'), 'utf8')
  assert.match(seed, /placeholder/)
})
