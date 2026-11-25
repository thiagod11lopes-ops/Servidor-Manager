import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  listSharedDisplayNameGroups,
  listSharedSourceUrlGroups,
  mergeDiscoveredSystemsIntoCatalog,
} from './coexistingInstallations.ts'

const REPO =
  'https://github.com/thiagod11lopes-ops/AcompSolemp/tree/cursor/servidor-lan-etapa16-bcc8'

describe('coexistingInstallations', () => {
  it('permite mesmo repositório Git com nomes e UUIDs diferentes', () => {
    const groups = listSharedSourceUrlGroups([
      { id: '42765375-a486-4541-8ef0-b028cb80556f', name: 'OMPS produção', url: REPO },
      { id: 'e21b8bae-beb8-44bd-8af9-1e420a0ea086', name: 'Teste', url: REPO },
    ])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.length, 2)
  })

  it('não agrupa URLs distintas', () => {
    const groups = listSharedSourceUrlGroups([
      { id: 'a', name: 'A', url: REPO },
      { id: 'b', name: 'B', url: 'https://github.com/other/repo' },
    ])
    assert.equal(groups.length, 0)
  })

  it('detecta nomes de exibição iguais em systemIds diferentes', () => {
    const groups = listSharedDisplayNameGroups([
      { id: '11111111-1111-4111-8111-111111111111', name: 'OMPS', url: REPO },
      { id: '22222222-2222-4222-8222-222222222222', name: 'omps', url: `${REPO}-other` },
    ])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.length, 2)
  })

  it('mergeDiscoveredSystemsIntoCatalog importa segundo UUID mesmo com mesma sourceUrl', () => {
    const current = [
      {
        id: '42765375-a486-4541-8ef0-b028cb80556f',
        name: 'Produção',
        url: REPO,
        status: 'instalado',
      },
    ]
    const discovered = [
      {
        systemId: 'e21b8bae-beb8-44bd-8af9-1e420a0ea086',
        sourceUrl: REPO,
        installedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    const { systems, changed } = mergeDiscoveredSystemsIntoCatalog(
      current,
      discovered,
      (_url, id) => `Sistema ${id.slice(0, 8)}`,
    )
    assert.equal(changed, true)
    assert.equal(systems.length, 2)
    assert.ok(systems.some((s) => s.id === 'e21b8bae-beb8-44bd-8af9-1e420a0ea086'))
  })

  it('não duplica systemId já presente no catálogo', () => {
    const current = [{ id: '42765375-a486-4541-8ef0-b028cb80556f', name: 'A', url: REPO }]
    const { changed, systems } = mergeDiscoveredSystemsIntoCatalog(
      current,
      [{ systemId: '42765375-a486-4541-8ef0-b028cb80556f', sourceUrl: REPO, installedAt: null }],
      () => 'x',
    )
    assert.equal(changed, false)
    assert.equal(systems.length, 1)
  })
})
