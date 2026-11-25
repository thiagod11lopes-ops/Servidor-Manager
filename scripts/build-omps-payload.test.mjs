import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  OMPS_PAYLOAD_FORBIDDEN_PATHS,
  OMPS_PAYLOAD_REQUIRED_PATHS,
} from './omps-payload-spec.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const payloadRoot = path.join(root, 'release', 'omps-payload')
const bundleMetaPath = path.join(root, 'release', 'omps-bundle', 'bundle-meta.json')
const lockPath = path.join(root, 'scripts', 'omps-payload-source.lock.json')

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

test('lock possui contentSha256 pinado', async () => {
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
  assert.match(lock.contentSha256, /^[a-f0-9]{64}$/)
})

test('payload contém caminhos obrigatórios do manifesto', async () => {
  for (const rel of OMPS_PAYLOAD_REQUIRED_PATHS) {
    assert.equal(await fileExists(path.join(payloadRoot, ...rel.split('/'))), true, rel)
  }
})

test('payload não contém caminhos proibidos', async () => {
  for (const rel of OMPS_PAYLOAD_FORBIDDEN_PATHS) {
    assert.equal(await fileExists(path.join(payloadRoot, ...rel.split('/'))), false, rel)
  }
})

test('bundle-meta integridade bate com lock', async () => {
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
  const meta = JSON.parse(await fs.readFile(bundleMetaPath, 'utf8'))
  assert.equal(meta.payloadContentSha256, lock.contentSha256)
  assert.equal(meta.schema, 'servidor-omps-bundle/1')
  assert.equal(meta.productId, 'servidor-omps')
  assert.equal(meta.ompsGitSha, null)
  assert.equal(meta.sourceRevision?.kind, 'content-sha256')
  assert.equal(meta.sourceRevision?.value, lock.contentSha256)
})

test('hash do payload no disco coincide com lock (amostra determinística)', async () => {
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
  const files = []

  async function walk(dir, prefix) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name
      if (ent.isDirectory()) await walk(path.join(dir, ent.name), rel)
      else if (ent.isFile()) files.push({ rel, abs: path.join(dir, ent.name) })
    }
  }

  await walk(payloadRoot, '')
  files.sort((a, b) => a.rel.localeCompare(b.rel))

  const hash = crypto.createHash('sha256')
  for (const { abs, rel } of files) {
    hash.update(rel.replace(/\\/g, '/'))
    hash.update('\0')
    hash.update(await fs.readFile(abs))
  }
  assert.equal(hash.digest('hex'), lock.contentSha256)
})
