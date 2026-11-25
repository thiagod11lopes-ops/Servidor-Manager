import assert from 'node:assert/strict'
import {
  parseSupabaseStatusOutput,
  supabaseStatusIndicatesDbStopped,
} from './supabaseLocalInspect.ts'

const prefixed = `Stopped services: [supabase_imgproxy_workspace]
{
  "DB_URL": "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  "API_URL": "http://127.0.0.1:54321"
}`

const parsed = parseSupabaseStatusOutput(prefixed)
assert.equal(parsed?.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:54322/postgres')

assert.equal(parseSupabaseStatusOutput('not json at all'), null)

assert.equal(supabaseStatusIndicatesDbStopped(prefixed), false)
assert.equal(
  supabaseStatusIndicatesDbStopped('Stopped services: [supabase_db_workspace]\n{"DB_URL":"x"}'),
  true,
)

console.log('supabaseLocalInspect.test.ts OK')
