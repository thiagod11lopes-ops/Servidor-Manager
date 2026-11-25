import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coerceInstallationDuplicateOptions,
  duplicateInstallHasPrimaryActions,
  getDuplicateInstallModalActions,
  inferInstallationDuplicateOptions,
  parseInstallationDuplicateConflict,
} from './installationDuplicateConflict.ts'

test('parseia conflito 409 completo', () => {
  const parsed = parseInstallationDuplicateConflict({
    ok: false,
    code: 'INSTALLATION_DUPLICATE',
    message: 'Foi encontrada uma instalação anterior incompleta ou com falha para a mesma origem.',
    existing: {
      systemId: 'ddb19ca9-6ae4-4e63-abb1-fa8af8d9127a',
      systemName: 'AcompOPMS',
      repositoryLabel: 'C:\\Program Files\\ServidorManager\\resources\\omps-payload',
      lifecycle: 'failed',
      lifecycleLabel: 'Instalação com falha',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      manifestStatus: 'phases-failed',
      installDirectory: 'C:\\ServidorManager\\systems\\ddb19ca9-6ae4-4e63-abb1-fa8af8d9127a',
    },
    options: { canResume: true, canReplace: true, canOpen: false, canCancel: true },
  })
  assert.ok(parsed)
  assert.equal(parsed?.existing.systemId, 'ddb19ca9-6ae4-4e63-abb1-fa8af8d9127a')
  assert.equal(parsed?.options.canResume, true)
  assert.equal(parsed?.options.canReplace, true)
  assert.equal(duplicateInstallHasPrimaryActions(parsed!.options), true)
})

test('infer opções quando backend omite options (instalação com falha)', () => {
  const parsed = parseInstallationDuplicateConflict({
    code: 'INSTALLATION_DUPLICATE',
    message: 'Foi encontrada uma instalação anterior incompleta ou com falha para a mesma origem.',
    existing: {
      systemId: 'ddb19ca9-6ae4-4e63-abb1-fa8af8d9127a',
      systemName: 'AcompOPMS',
      repositoryLabel: 'payload',
      lifecycle: 'failed',
      lifecycleLabel: 'Instalação com falha',
      lastActivityAt: null,
      manifestStatus: 'phases-failed',
      installDirectory: null,
    },
  })
  assert.ok(parsed)
  assert.equal(parsed?.options.canResume, true)
  assert.equal(parsed?.options.canReplace, true)
})

test('não confunde erro genérico sem existing', () => {
  const parsed = parseInstallationDuplicateConflict({
    ok: false,
    message: 'Foi encontrada uma instalação anterior incompleta ou com falha para a mesma origem.',
  })
  assert.equal(parsed, null)
})

test('inferInstallationDuplicateOptions para concluída', () => {
  const opts = inferInstallationDuplicateOptions('completed')
  assert.equal(opts.canOpen, true)
  assert.equal(opts.canResume, false)
})

test('parseia envelope duplicate-check (conflict aninhado)', () => {
  const parsed = parseInstallationDuplicateConflict({
    ok: true,
    duplicate: true,
    conflict: {
      ok: false,
      code: 'INSTALLATION_DUPLICATE',
      message: 'Foi encontrada uma instalação anterior incompleta ou com falha para a mesma origem.',
      existing: {
        systemId: '11111111-1111-1111-1111-111111111111',
        systemName: 'AcompOPMS',
        repositoryLabel: 'payload',
        lifecycle: 'failed',
        lifecycleLabel: 'Instalação com falha',
        lastActivityAt: null,
        manifestStatus: null,
        installDirectory: null,
      },
      options: { canResume: true, canReplace: true, canOpen: false, canCancel: true },
    },
  })
  assert.ok(parsed)
  assert.equal(parsed?.existing.systemId, '11111111-1111-1111-1111-111111111111')
})

test('coerce reabilita ações quando backend envia options vazias para falha', () => {
  const coerced = coerceInstallationDuplicateOptions(
    { canResume: false, canReplace: false, canOpen: false, canCancel: true },
    'failed',
    'Foi encontrada uma instalação anterior incompleta ou com falha para a mesma origem. Retome ou exclua antes de criar outra.',
  )
  assert.equal(coerced.canResume, true)
  assert.equal(coerced.canReplace, true)
})

test('ambiguidade habilita ações após escolher candidato interrompido', () => {
  const conflict = {
    ok: false as const,
    code: 'INSTALLATION_DUPLICATE' as const,
    message: 'duas instalações',
    existing: {
      systemId: 'a',
      systemName: 'A',
      repositoryLabel: 'x',
      lifecycle: 'completed' as const,
      lifecycleLabel: 'Instalação concluída',
      lastActivityAt: null,
      manifestStatus: null,
      installDirectory: null,
    },
    options: { canResume: false, canReplace: false, canOpen: true, canCancel: true as const },
    ambiguous: true,
    candidates: [
      {
        systemId: 'a',
        systemName: 'A',
        repositoryLabel: 'x',
        lifecycle: 'completed' as const,
        lifecycleLabel: 'Instalação concluída',
        lastActivityAt: null,
        manifestStatus: null,
        installDirectory: null,
      },
      {
        systemId: 'b',
        systemName: 'B',
        repositoryLabel: 'x',
        lifecycle: 'interrupted' as const,
        lifecycleLabel: 'Instalação interrompida',
        lastActivityAt: null,
        manifestStatus: null,
        installDirectory: null,
      },
    ],
  }
  const blocked = getDuplicateInstallModalActions(conflict)
  assert.equal(blocked.showResume, false)
  const forB = getDuplicateInstallModalActions(conflict, 'b')
  assert.equal(forB.showResume, true)
  assert.equal(forB.showReplace, true)
})

test('getDuplicateInstallModalActions expõe retomar, excluir e cancelar', () => {
  const conflict = parseInstallationDuplicateConflict({
    code: 'INSTALLATION_DUPLICATE',
    message: 'duplicata',
    existing: {
      systemId: '22222222-2222-2222-2222-222222222222',
      systemName: 'X',
      repositoryLabel: 'payload',
      lifecycle: 'failed',
      lifecycleLabel: 'Falha',
      lastActivityAt: null,
      manifestStatus: null,
      installDirectory: null,
    },
  })
  assert.ok(conflict)
  const actions = getDuplicateInstallModalActions(conflict!)
  assert.equal(actions.showCancel, true)
  assert.equal(actions.showResume, true)
  assert.equal(actions.showReplace, true)
  assert.equal(actions.replaceRequiresConfirmation, true)
})
