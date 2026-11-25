import assert from 'node:assert/strict'
import test from 'node:test'
import {
  handlingForDuplicateMessage,
  handlingFromInstallFailure,
  resolveDuplicateFromServicePayload,
  shouldRenderOmpsSetupPageMessage,
} from './bundledOmpsDuplicateInstallFlow.ts'

const DUPLICATE_MESSAGE =
  'Foi encontrada uma instalação anterior incompleta ou com falha para a mesma origem. Retome ou exclua antes de criar outra.'

const FULL_CONFLICT = {
  ok: false as const,
  code: 'INSTALLATION_DUPLICATE' as const,
  message: DUPLICATE_MESSAGE,
  existing: {
    systemId: '1d6fe8f5-c005-4bd6-aa53-694c231cee28',
    systemName: 'Sistema',
    repositoryLabel: 'payload',
    lifecycle: 'failed' as const,
    lifecycleLabel: 'Falha',
    lastActivityAt: null,
    manifestStatus: null,
    installDirectory: null,
  },
  options: {
    canResume: true,
    canReplace: true,
    canOpen: false,
    canCancel: true as const,
  },
}

test('duplicate-check payload abre modal com conflito completo', () => {
  const payload = { ok: true, duplicate: true, conflict: FULL_CONFLICT }
  const conflict = resolveDuplicateFromServicePayload(payload)
  assert.ok(conflict)
  const handling = handlingForDuplicateMessage(DUPLICATE_MESSAGE, conflict)
  assert.equal(handling.kind, 'duplicate_modal')
  if (handling.kind === 'duplicate_modal') {
    assert.equal(handling.conflict.existing.systemId, FULL_CONFLICT.existing.systemId)
  }
})

test('resposta install só com message de duplicidade vira modal incompleto, não página', () => {
  const handling = handlingFromInstallFailure({ ok: false, message: DUPLICATE_MESSAGE }, null)
  assert.ok(handling)
  assert.equal(handling?.kind, 'duplicate_incomplete_modal')
  assert.equal(shouldRenderOmpsSetupPageMessage(DUPLICATE_MESSAGE, false), false)
})

test('409 install com corpo completo abre modal com ações', () => {
  const handling = handlingFromInstallFailure(FULL_CONFLICT, null)
  assert.equal(handling?.kind, 'duplicate_modal')
  if (handling?.kind === 'duplicate_modal') {
    assert.equal(handling.conflict.options.canResume, true)
    assert.equal(handling.conflict.options.canReplace, true)
  }
})

test('erro genérico continua na página', () => {
  const handling = handlingFromInstallFailure(
    { ok: false, message: 'Docker indisponível.' },
    null,
  )
  assert.equal(handling?.kind, 'page_message')
  assert.equal(shouldRenderOmpsSetupPageMessage('Docker indisponível.', false), true)
})
