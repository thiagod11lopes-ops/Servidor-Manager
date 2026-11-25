import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { supabaseWorkdirsEqual } from './supabaseStackWorkdir.ts'
import { formatSupabaseWorkdirMismatchMessage } from './supabaseLocalCommands.ts'

describe('supabaseWorkdirsEqual', () => {
  it('normaliza barras e case no Windows', () => {
    assert.equal(
      supabaseWorkdirsEqual(
        'C:\\ServidorManager\\systems\\abc\\project',
        'c:/ServidorManager/systems/abc/project/',
      ),
      true,
    )
  })

  it('detecta diretórios diferentes', () => {
    assert.equal(
      supabaseWorkdirsEqual(
        'C:\\ServidorManager\\systems\\42765375-a486-4541-8ef0-b028cb80556f\\project',
        'C:\\ServidorManager\\systems\\300442b8-0a0c-443c-a2dd-4fcdb69fa825\\project',
      ),
      false,
    )
  })
})

describe('formatSupabaseWorkdirMismatchMessage', () => {
  it('menciona workdirs registrado e esperado', () => {
    const text = formatSupabaseWorkdirMismatchMessage({
      registeredWorkdir: 'C:\\old\\project',
      expectedWorkdir: 'C:\\new\\project',
    })
    assert.match(text, /C:\\old\\project/)
    assert.match(text, /C:\\new\\project/)
    assert.match(text, /supabase stop/)
  })
})
