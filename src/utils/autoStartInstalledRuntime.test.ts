import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldAutoStartInstalledRuntime } from './autoStartInstalledRuntime.ts'

describe('shouldAutoStartInstalledRuntime', () => {
  it('inicia quando parado ou instalado', () => {
    assert.equal(shouldAutoStartInstalledRuntime({ state: 'parado' } as never), true)
    assert.equal(shouldAutoStartInstalledRuntime({ state: 'instalado' } as never), true)
    assert.equal(shouldAutoStartInstalledRuntime(undefined), true)
  })

  it('não inicia quando já em execução ou transição', () => {
    assert.equal(shouldAutoStartInstalledRuntime({ state: 'executando' } as never), false)
    assert.equal(shouldAutoStartInstalledRuntime({ state: 'iniciando' } as never), false)
    assert.equal(shouldAutoStartInstalledRuntime({ state: 'encerrando' } as never), false)
  })
})
