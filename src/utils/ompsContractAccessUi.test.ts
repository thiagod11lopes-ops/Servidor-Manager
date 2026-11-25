import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectOmpsLanAccessProblems,
  initialOmpsContractAccessUiState,
  isOmpsShareableLoginUrl,
  markOmpsContractAccessPollFailed,
  reduceOmpsContractAccessPoll,
  resolveDashboardLanAccessView,
  resolveOmpsLanAccessHealth,
} from './ompsContractAccessUi.ts'

const SAMPLE_LOGIN = 'http://10.0.0.5:8080/login'

test('estado inicial exibe Verificando...', () => {
  const state = initialOmpsContractAccessUiState()
  assert.equal(state.phase, 'checking')
  assert.equal(state.analyzing, false)
  assert.equal(state.analyzeStartedAt, null)
  assert.equal(state.statusLabel, 'Verificando...')
  assert.equal(state.loginUrl, '—')
})

test('transição para Ativo após resposta válida', () => {
  const prev = initialOmpsContractAccessUiState()
  const next = reduceOmpsContractAccessPoll(prev, {
    ok: true,
    available: true,
    loginUrl: SAMPLE_LOGIN,
    availability: 'active',
    message: 'Contrato confirmado.',
    checkedAt: '2026-01-01T12:00:00.000Z',
    lastSuccessAt: '2026-01-01T12:00:00.000Z',
    dashboardOrigin: null,
    dashboardDiffersFromContract: false,
  })
  assert.equal(next.phase, 'active')
  assert.equal(next.statusLabel, 'Ativo')
  assert.equal(next.badgeClass, 'badge-real')
})

test('transição para Indisponível após falha', () => {
  const prev = {
    ...initialOmpsContractAccessUiState(),
    phase: 'active' as const,
    statusLabel: 'Ativo',
    lastSuccessAt: '2026-01-01T11:00:00.000Z',
  }
  const next = reduceOmpsContractAccessPoll(prev, {
    ok: true,
    available: true,
    loginUrl: SAMPLE_LOGIN,
    availability: 'unavailable',
    message: 'Porta TCP 8080 não está em escuta.',
    checkedAt: '2026-01-01T12:00:00.000Z',
    lastSuccessAt: null,
    dashboardOrigin: null,
    dashboardDiffersFromContract: false,
  })
  assert.equal(next.phase, 'unavailable')
  assert.equal(next.statusLabel, 'Indisponível')
  assert.equal(next.lastSuccessAt, '2026-01-01T11:00:00.000Z')
})

test('falha de transporte da API mantém endereço fixo', () => {
  const prev = { ...initialOmpsContractAccessUiState(), loginUrl: SAMPLE_LOGIN }
  const next = markOmpsContractAccessPollFailed(prev, 'timeout', '2026-01-01T12:00:00.000Z')
  assert.equal(next.loginUrl, SAMPLE_LOGIN)
  assert.equal(next.phase, 'unavailable')
})

test('isOmpsShareableLoginUrl rejeita placeholder', () => {
  assert.equal(isOmpsShareableLoginUrl('—'), false)
  assert.equal(isOmpsShareableLoginUrl(SAMPLE_LOGIN), true)
})

test('resolveDashboardLanAccessView — verificando sem URL', () => {
  const view = resolveDashboardLanAccessView(initialOmpsContractAccessUiState())
  assert.equal(view.displayUrl, null)
  assert.equal(view.tone, 'checking')
})

test('resolveDashboardLanAccessView — verificando com URL já conhecida', () => {
  const view = resolveDashboardLanAccessView(
    initialOmpsContractAccessUiState('http://127.0.0.1:8080/login'),
  )
  assert.equal(view.displayUrl, 'http://127.0.0.1:8080/login')
  assert.equal(view.tone, 'checking')
})

test('isOmpsShareableLoginUrl aceita endereço local', () => {
  assert.equal(isOmpsShareableLoginUrl('http://127.0.0.1:8080/login'), true)
})

test('resolveDashboardLanAccessView — ativo com porta real', () => {
  const view = resolveDashboardLanAccessView({
    ...initialOmpsContractAccessUiState(),
    phase: 'active',
    loginUrl: 'http://127.0.0.1:8081/login',
    message: 'Contrato confirmado.',
    statusLabel: 'Ativo',
    badgeClass: 'badge-real',
    lastCheckedAt: '2026-01-01T12:00:00.000Z',
    lastSuccessAt: '2026-01-01T12:00:00.000Z',
  })
  assert.equal(view.displayUrl, 'http://127.0.0.1:8081/login')
  assert.equal(view.tone, 'ready')
})

test('resposta ok:false com loginUrl exibe endereço e motivo', () => {
  const prev = initialOmpsContractAccessUiState()
  const next = reduceOmpsContractAccessPoll(prev, {
    ok: false,
    available: false,
    message: 'API local offline.',
    loginUrl: 'http://127.0.0.1:8080/login',
    checkedAt: '2026-01-01T12:00:00.000Z',
  })
  assert.equal(next.loginUrl, 'http://127.0.0.1:8080/login')
  assert.equal(next.message, 'API local offline.')
  const view = resolveDashboardLanAccessView(next)
  assert.equal(view.displayUrl, 'http://127.0.0.1:8080/login')
  assert.equal(view.tone, 'pending')
  assert.match(view.statusLine, /offline/)
})

test('resolveOmpsLanAccessHealth — verde, laranja e vermelho', () => {
  assert.equal(
    resolveOmpsLanAccessHealth({
      ...initialOmpsContractAccessUiState('http://127.0.0.1:8080/login'),
    }),
    'warn',
  )
  assert.equal(
    resolveOmpsLanAccessHealth({
      ...initialOmpsContractAccessUiState(),
      phase: 'active',
      analyzing: true,
      statusLabel: 'Ativo',
      badgeClass: 'badge-real',
      message: 'OK',
      lastCheckedAt: '2026-01-01T12:00:00.000Z',
      lastSuccessAt: '2026-01-01T12:00:00.000Z',
    }),
    'warn',
  )
  assert.equal(
    resolveOmpsLanAccessHealth({
      ...initialOmpsContractAccessUiState(),
      phase: 'active',
      analyzing: false,
      statusLabel: 'Ativo',
      badgeClass: 'badge-real',
      message: 'OK',
      lastCheckedAt: '2026-01-01T12:00:00.000Z',
      lastSuccessAt: '2026-01-01T12:00:00.000Z',
    }),
    'ok',
  )
  assert.equal(
    resolveOmpsLanAccessHealth({
      ...initialOmpsContractAccessUiState(),
      phase: 'unavailable',
      analyzing: false,
      statusLabel: 'Indisponível',
      badgeClass: 'badge-warn',
      message: 'Porta fechada.',
      lastCheckedAt: '2026-01-01T12:00:00.000Z',
      lastSuccessAt: null,
    }),
    'error',
  )
})

test('collectOmpsLanAccessProblems inclui mensagens e última verificação', () => {
  const lines = collectOmpsLanAccessProblems({
    ...initialOmpsContractAccessUiState(),
    phase: 'unavailable',
    analyzing: false,
    loginUrl: SAMPLE_LOGIN,
    statusLabel: 'Indisponível',
    badgeClass: 'badge-warn',
    message: 'Porta TCP 8080 não está em escuta. HTTP /login timeout.',
    lastCheckedAt: '2026-01-01T12:00:00.000Z',
    lastSuccessAt: null,
  })
  assert.ok(lines.some((l) => l.includes('8080')))
  assert.ok(lines.some((l) => l.includes('Última verificação')))
})

test('collectOmpsLanAccessProblems mantém erros durante nova análise', () => {
  const lines = collectOmpsLanAccessProblems({
    ...initialOmpsContractAccessUiState(),
    phase: 'unavailable',
    analyzing: true,
    loginUrl: SAMPLE_LOGIN,
    statusLabel: 'Indisponível',
    badgeClass: 'badge-warn',
    message: 'Porta TCP 8080 não está em escuta.',
    lastCheckedAt: '2026-01-01T12:00:00.000Z',
    lastSuccessAt: null,
  })
  assert.ok(lines.some((l) => l.includes('8080')))
  assert.ok(lines.some((l) => l.includes('último resultado conhecido')))
})

test('resolveDashboardLanAccessView — indisponível mantém URL determinada', () => {
  const view = resolveDashboardLanAccessView({
    ...initialOmpsContractAccessUiState(),
    phase: 'unavailable',
    loginUrl: SAMPLE_LOGIN,
    message: 'Porta TCP 8081 não está em escuta nesta máquina.',
    statusLabel: 'Indisponível',
    badgeClass: 'badge-warn',
    lastCheckedAt: '2026-01-01T12:00:00.000Z',
    lastSuccessAt: null,
  })
  assert.equal(view.displayUrl, SAMPLE_LOGIN)
  assert.equal(view.tone, 'pending')
  assert.match(view.statusLine, /8081/)
})
