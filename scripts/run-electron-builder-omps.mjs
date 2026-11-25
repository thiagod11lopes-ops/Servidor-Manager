#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sevenZ = path.join(root, 'node_modules', '7zip-bin', 'win', 'x64')

const env = {
  ...process.env,
  PATH: `${sevenZ}${path.delimiter}${process.env.PATH ?? ''}`,
}

const args = process.argv.slice(2)
const r = spawnSync('npx', ['electron-builder', ...args], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
})
process.exit(r.status ?? 1)
