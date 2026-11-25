import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { remoteValidationAccessModeBlockMessage } from './remoteValidationAccessMode.ts'

describe('remoteValidationAccessMode messages', () => {
  it('informa descontinuação e orienta uso LAN', () => {
    assert.match(remoteValidationAccessModeBlockMessage('REMOVED'), /descontinuada/i)
    assert.match(remoteValidationAccessModeBlockMessage('REMOVED'), /Rede local|LAN/i)
  })
})
