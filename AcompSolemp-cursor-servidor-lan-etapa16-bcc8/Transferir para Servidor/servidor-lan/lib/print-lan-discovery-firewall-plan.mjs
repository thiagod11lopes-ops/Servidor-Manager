#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadServidorEnv } from './load-servidor-env.mjs'
import { buildLanDiscoveryUdpRulePlanFromEnv } from './firewall-lan-plan.mjs'

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'servidor.env')
const cfg = loadServidorEnv(envPath)
const plan = buildLanDiscoveryUdpRulePlanFromEnv(cfg.envVars ?? {})
process.stdout.write(`${JSON.stringify(plan)}\n`)
