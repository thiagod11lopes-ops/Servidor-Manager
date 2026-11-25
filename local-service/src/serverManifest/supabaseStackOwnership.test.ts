import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { supabaseWorkdirsEqual } from './supabaseStackWorkdir.ts'

describe('supabaseStackOwnership helpers', () => {
  it('workdir match para resolver systemId', () => {
    assert.equal(
      supabaseWorkdirsEqual(
        'C:\\ServidorManager\\systems\\42765375-a486-4541-8ef0-b028cb80556f\\project',
        'c:/ServidorManager/systems/42765375-a486-4541-8ef0-b028cb80556f/project',
      ),
      true,
    )
  })
})
