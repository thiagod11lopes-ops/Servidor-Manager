import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getManagerConfigDir,
  getManagerDataRoot,
  getManagerLogsDir,
  getManagerMonitoringRoot,
} from './managerDataRoot.ts'
import { getSystemsRoot } from './paths.ts'

test('SERVIDOR_MANAGER_DATA_ROOT isola config, logs, systems e monitoring', () => {
  const prev = process.env.SERVIDOR_MANAGER_DATA_ROOT
  const prevSystems = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  const prevConfig = process.env.SERVIDOR_MANAGER_CONFIG_DIR
  const isolated = 'D:\\sm-isolated-test-root'
  process.env.SERVIDOR_MANAGER_DATA_ROOT = isolated
  delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  delete process.env.SERVIDOR_MANAGER_CONFIG_DIR
  try {
    assert.equal(getManagerDataRoot(), isolated)
    assert.equal(getManagerConfigDir(), `${isolated}\\config`)
    assert.equal(getManagerLogsDir(), `${isolated}\\logs`)
    assert.equal(getManagerMonitoringRoot(), `${isolated}\\monitoring`)
    assert.equal(getSystemsRoot(), `${isolated}\\systems`)
  } finally {
    if (prev === undefined) delete process.env.SERVIDOR_MANAGER_DATA_ROOT
    else process.env.SERVIDOR_MANAGER_DATA_ROOT = prev
    if (prevSystems === undefined) delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    else process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prevSystems
    if (prevConfig === undefined) delete process.env.SERVIDOR_MANAGER_CONFIG_DIR
    else process.env.SERVIDOR_MANAGER_CONFIG_DIR = prevConfig
  }
})
