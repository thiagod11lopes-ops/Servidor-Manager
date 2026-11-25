import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { formatDatabaseNumber, syncDatabaseNumberRegistry } from './databaseNumberRegistry.ts'

describe('databaseNumberRegistry', () => {
  let tempConfigDir: string | null = null

  afterEach(async () => {
    delete process.env.SERVIDOR_MANAGER_CONFIG_DIR
    if (tempConfigDir) {
      await fs.rm(tempConfigDir, { recursive: true, force: true })
      tempConfigDir = null
    }
  })

  async function useTempRegistry(): Promise<void> {
    tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bnc-registry-'))
    process.env.SERVIDOR_MANAGER_CONFIG_DIR = tempConfigDir
  }

  it('formatDatabaseNumber produz BNC01', () => {
    assert.equal(formatDatabaseNumber(1), 'BNC01')
    assert.equal(formatDatabaseNumber(12), 'BNC12')
  })

  it('atribui BNC01 e BNC02 por ordem de instalação', async () => {
    await useTempRegistry()

    const first = await syncDatabaseNumberRegistry([
      { systemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', installedAt: '2026-01-01T00:00:00.000Z' },
    ])
    assert.equal(first['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], 'BNC01')

    const second = await syncDatabaseNumberRegistry([
      { systemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', installedAt: '2026-01-01T00:00:00.000Z' },
      { systemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', installedAt: '2026-01-02T00:00:00.000Z' },
    ])
    assert.equal(second['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'], 'BNC02')
  })

  it('preserva códigos existentes e não reutiliza lacunas', async () => {
    await useTempRegistry()

    await syncDatabaseNumberRegistry([
      { systemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', installedAt: '2026-01-01T00:00:00.000Z' },
      { systemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', installedAt: '2026-01-02T00:00:00.000Z' },
    ])

    const afterRemoval = await syncDatabaseNumberRegistry([
      { systemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', installedAt: '2026-01-02T00:00:00.000Z' },
    ])
    assert.equal(afterRemoval['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'], 'BNC02')

    const withNew = await syncDatabaseNumberRegistry([
      { systemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', installedAt: '2026-01-02T00:00:00.000Z' },
      { systemId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', installedAt: '2026-01-03T00:00:00.000Z' },
    ])
    assert.equal(withNew['cccccccc-cccc-4ccc-8ccc-cccccccccccc'], 'BNC03')
  })
})
