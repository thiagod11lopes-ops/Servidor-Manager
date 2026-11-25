import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  frontendDependencyBinsReady,
  resolveFrontendNpmInstallCommand,
} from './ensureManifestFrontendDependencies.ts'

describe('ensureManifestFrontendDependencies', () => {
  it('resolve npm ci quando há package-lock.json', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fe-'))
    await fs.writeFile(path.join(dir, 'package.json'), '{}')
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}')
    const cmd = await resolveFrontendNpmInstallCommand(dir)
    assert.ok(cmd)
    assert.equal(cmd!.args[0], 'ci')
    assert.ok(cmd!.args.includes('--include=dev'))
  })

  it('detecta tsc/vite em node_modules/.bin', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fe-'))
    const bin = path.join(dir, 'node_modules', '.bin')
    await fs.mkdir(bin, { recursive: true })
    await fs.writeFile(path.join(bin, 'tsc.cmd'), '')
    await fs.writeFile(path.join(bin, 'vite.cmd'), '')
    assert.equal(await frontendDependencyBinsReady(dir), true)
  })
})
