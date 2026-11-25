import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MANAGER_ELEVATED_RUN_ENV } from './runElevatedPowerShell.ts'

describe('runElevatedPowerShell', () => {
  it('expõe variável de ambiente para scripts PowerShell do manifesto', () => {
    assert.equal(MANAGER_ELEVATED_RUN_ENV, 'SM_MANAGER_ELEVATED_RUN')
  })
})
