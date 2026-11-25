import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDashboardInstalledSystemsDisplay } from './dashboardInstalledInventory.ts'

const dbEmpty = { systemsRequiringDatabase: 0, postgresqlServerAvailable: false }

describe('buildDashboardInstalledSystemsDisplay', () => {
  it('inventário confirmado vazio mostra 0 mesmo com cadastros locais fictícios', () => {
    const display = buildDashboardInstalledSystemsDisplay(
      { confirmed: true, summary: { installed: 0, running: 0, stopped: 0, error: 0 } },
      { systemsRequiringDatabase: 2, postgresqlServerAvailable: true },
    )
    assert.equal(display.value, '0')
    assert.match(display.detail, /Nenhum sistema instalado no servidor/)
    assert.match(display.detail, /2 exigem banco/)
  })

  it('inventário confirmado com instalações reflete running/stopped/error', () => {
    const display = buildDashboardInstalledSystemsDisplay(
      { confirmed: true, summary: { installed: 2, running: 1, stopped: 1, error: 0 } },
      dbEmpty,
    )
    assert.equal(display.value, '2')
    assert.match(display.detail, /^2 instalado\(s\) · 1 executando · 1 parado\(s\) · 0 com erro/)
  })

  it('inventário indisponível não exibe contagem local', () => {
    const display = buildDashboardInstalledSystemsDisplay(
      {
        confirmed: false,
        message: 'Inventário no servidor indisponível (local-service não respondeu).',
      },
      dbEmpty,
    )
    assert.equal(display.value, '—')
    assert.match(display.detail, /indisponível/)
  })
})
