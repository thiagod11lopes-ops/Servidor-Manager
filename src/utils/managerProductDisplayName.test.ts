import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SERVIDOR_MANAGER_PRODUCT_NAME,
  SERVIDOR_OMPS_PRODUCT_NAME,
  getManagerProductDisplayName,
} from './managerProductDisplayName.ts'

describe('managerProductDisplayName', () => {
  it('exporta nomes comerciais estáveis', () => {
    assert.equal(SERVIDOR_OMPS_PRODUCT_NAME, 'Servidor OMPS')
    assert.equal(SERVIDOR_MANAGER_PRODUCT_NAME, 'Servidor Manager')
  })

  it('retorna Manager quando não há variante OMPS em runtime', () => {
    assert.equal(getManagerProductDisplayName(), SERVIDOR_MANAGER_PRODUCT_NAME)
  })
})
