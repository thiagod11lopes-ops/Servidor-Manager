import assert from 'node:assert/strict'
import test from 'node:test'
import { capacityStateForUsedPercent } from './volumeStats.ts'
import { DEFAULT_MONITORING_SETTINGS } from './types.ts'

test('capacityStateForUsedPercent respects default thresholds', () => {
  assert.equal(capacityStateForUsedPercent(50), 'normal')
  assert.equal(capacityStateForUsedPercent(80), 'attention')
  assert.equal(capacityStateForUsedPercent(90), 'critical')
  assert.equal(capacityStateForUsedPercent(95), 'severe')
  assert.equal(capacityStateForUsedPercent(null), 'unknown')
})

test('default settings ordering', () => {
  assert.ok(DEFAULT_MONITORING_SETTINGS.attentionUsedPercent < DEFAULT_MONITORING_SETTINGS.criticalUsedPercent)
  assert.ok(DEFAULT_MONITORING_SETTINGS.criticalUsedPercent < DEFAULT_MONITORING_SETTINGS.severeUsedPercent)
})
