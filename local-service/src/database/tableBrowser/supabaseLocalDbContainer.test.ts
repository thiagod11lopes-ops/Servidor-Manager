import assert from 'node:assert/strict'
import {
  parseDatabaseNameFromDbUrl,
  supabaseDbContainerName,
} from './supabaseLocalDbContainer.ts'

assert.equal(supabaseDbContainerName('workspace'), 'supabase_db_workspace')
assert.equal(
  parseDatabaseNameFromDbUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
  'postgres',
)

console.log('supabaseLocalDbContainer.test.ts OK')
