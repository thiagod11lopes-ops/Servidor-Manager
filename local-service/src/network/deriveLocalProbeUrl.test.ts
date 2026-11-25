import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deriveLocalProbeUrlFromCanonical } from './deriveLocalProbeUrl.ts'

describe('deriveLocalProbeUrlFromCanonical', () => {
  it('preserva porta caminho e query em 127.0.0.1', () => {
    const url = deriveLocalProbeUrlFromCanonical('http://192.168.1.5:8080/app?x=1')
    assert.equal(url, 'http://127.0.0.1:8080/app?x=1')
  })

  it('usa portFallback quando a URL nao declara porta', () => {
    const url = deriveLocalProbeUrlFromCanonical('http://192.168.0.2/login', 4173)
    assert.equal(url, 'http://127.0.0.1:4173/login')
  })

  it('retorna null sem porta explicita nem fallback', () => {
    assert.equal(deriveLocalProbeUrlFromCanonical('http://192.168.0.2/login'), null)
  })

  it('rejeita credenciais embutidas', () => {
    assert.equal(deriveLocalProbeUrlFromCanonical('http://u:p@127.0.0.1:8080/'), null)
  })

  it('preserva fragmento', () => {
    const url = deriveLocalProbeUrlFromCanonical('http://10.0.0.1:3000/#/home')
    assert.equal(url, 'http://127.0.0.1:3000/#/home')
  })
})
