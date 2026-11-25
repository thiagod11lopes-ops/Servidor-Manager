import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

export function stripUtf8Bom(text) {
  return String(text ?? '').replace(/^\uFEFF/, '')
}

/**
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
export function parseDesktopConfigText(raw) {
  let text = stripUtf8Bom(raw).trim()
  if (!text) throw new SyntaxError('JSON vazio')
  let data = JSON.parse(text)
  if (typeof data === 'string') {
    data = JSON.parse(stripUtf8Bom(data).trim())
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new SyntaxError('JSON deve ser um objeto')
  }
  return data
}

/** @param {string} filePath */
export function readDesktopConfigObject(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const data = parseDesktopConfigText(raw)
  return { raw, data: { ...data, _configPath: filePath } }
}

/** @param {string} filePath @param {Record<string, unknown>} body */
export function writeDesktopConfigObject(filePath, body) {
  const payload = { ...body }
  delete payload._configPath
  delete payload._migratedFrom
  delete payload._recoveredFromCorrupt
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export function backupConfigFile(filePath, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${filePath}.${label}-${stamp}.json`
  copyFileSync(filePath, backupPath)
  return backupPath
}

/**
 * Config inválida gerada pelo OMPS (PostInstall PS, migração ou contrato LAN).
 * @param {string} raw
 */
export function isRecognizableOmpsGeneratedConfigRaw(raw) {
  const text = stripUtf8Bom(raw)
  if (/github\.io\/AcompSolemp/i.test(text)) return true
  if (/192\.168\.1\.100:8080/.test(text)) return true
  return false
}
