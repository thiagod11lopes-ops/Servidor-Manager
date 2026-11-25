import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GIT_BASH_KNOWN_PATHS,
  resolveWindowsBashExecutable,
  type ResolveWindowsBashDeps,
} from './resolveWindowsBash.ts'

const GIT_BASH = GIT_BASH_KNOWN_PATHS[0]

function deps(overrides: Partial<ResolveWindowsBashDeps>): Partial<ResolveWindowsBashDeps> {
  return {
    platform: 'win32',
    isCommandAvailable: async () => false,
    bashVersionOk: async () => false,
    fileExists: async () => false,
    ...overrides,
  }
}

describe('resolveWindowsBashExecutable', () => {
  it('usa bash prioritário do PATH quando --version responde', async () => {
    const resolved = await resolveWindowsBashExecutable(
      deps({
        isCommandAvailable: async (command) => command === 'bash',
        bashVersionOk: async (executable) => executable === 'bash',
        fileExists: async () => true,
      }),
    )
    assert.equal(resolved, 'bash')
  })

  it('recorre ao Git Bash quando bash do PATH falha em --version', async () => {
    const resolved = await resolveWindowsBashExecutable(
      deps({
        isCommandAvailable: async (command) => command === 'bash',
        bashVersionOk: async (executable) => executable === GIT_BASH,
        fileExists: async (filePath) => filePath === GIT_BASH,
      }),
    )
    assert.equal(resolved, GIT_BASH)
  })

  it('retorna null quando PATH e candidatos Git falham', async () => {
    const resolved = await resolveWindowsBashExecutable(
      deps({
        isCommandAvailable: async (command) => command === 'bash',
        bashVersionOk: async () => false,
        fileExists: async (filePath) => GIT_BASH_KNOWN_PATHS.includes(filePath as (typeof GIT_BASH_KNOWN_PATHS)[number]),
      }),
    )
    assert.equal(resolved, null)
  })

  it('não aceita candidato Git sem fileExists true', async () => {
    const resolved = await resolveWindowsBashExecutable(
      deps({
        isCommandAvailable: async () => false,
        bashVersionOk: async (executable) => executable === GIT_BASH,
        fileExists: async () => false,
      }),
    )
    assert.equal(resolved, null)
  })
})
