import assert from 'node:assert/strict'
import test from 'node:test'
import type { ManagedInstallationRecord } from './enumerateManagedInstallations.ts'
import {
  classifyInstallationOriginMatch,
  isAmbiguousOriginSelection,
  pickRecommendedInstallationRecord,
} from './installationOriginMatch.ts'

function record(partial: Partial<ManagedInstallationRecord> & Pick<ManagedInstallationRecord, 'systemId'>): ManagedInstallationRecord {
  return {
    systemName: partial.systemId,
    repositoryLabel: 'origem',
    sourceKeys: partial.sourceKeys ?? [],
    sourcedKeys: partial.sourcedKeys ?? [],
    installDirectory: null,
    projectDirectory: null,
    lifecycle: partial.lifecycle ?? 'partial',
    manifestOk: null,
    manifestStatus: null,
    progressStatus: null,
    lastActivityAt: partial.lastActivityAt ?? null,
    ...partial,
  }
}

test('origem comprovada via manifesto', () => {
  const item = record({
    systemId: 'a',
    sourcedKeys: [{ key: 'git:https://github.com/x/y', provenance: 'manifest' }],
    sourceKeys: ['git:https://github.com/x/y'],
  })
  assert.equal(classifyInstallationOriginMatch(item, ['git:https://github.com/x/y']), 'proven')
})

test('origem provável via first-run bundled', () => {
  const item = record({
    systemId: 'b',
    sourcedKeys: [{ key: 'bundled:abc', provenance: 'first_run' }],
    sourceKeys: ['bundled:abc'],
  })
  assert.equal(classifyInstallationOriginMatch(item, ['bundled:abc', 'local:c:/payload']), 'probable')
})

test('origem indeterminada — apenas fallback system:', () => {
  const item = record({
    systemId: 'c3d4e5f6-a7b8-4242-9cde-f12345678902',
    sourcedKeys: [{ key: 'system:c3d4e5f6-a7b8-4242-9cde-f12345678902', provenance: 'system_fallback' }],
    sourceKeys: ['system:c3d4e5f6-a7b8-4242-9cde-f12345678902'],
  })
  assert.equal(classifyInstallationOriginMatch(item, ['bundled:abc']), 'different')
  assert.equal(
    classifyInstallationOriginMatch(item, ['system:c3d4e5f6-a7b8-4242-9cde-f12345678902']),
    'indeterminate',
  )
})

test('várias instalações comprovadas geram ambiguidade', () => {
  const matches = [
    { tier: 'proven' as const, record: record({ systemId: '1', lifecycle: 'completed' }) },
    { tier: 'proven' as const, record: record({ systemId: '2', lifecycle: 'interrupted' }) },
  ]
  assert.equal(isAmbiguousOriginSelection(matches), true)
  assert.equal(pickRecommendedInstallationRecord(matches)?.systemId, '2')
})
