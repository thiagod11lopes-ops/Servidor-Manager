/**
 * Validação offline de desinstalador NSIS gerado por WriteUninstaller (makensis BUILD_UNINSTALLER + exec do stub).
 * Não executa PE — apenas estrutura MZ/PE + bloco NsisInst coerente.
 */
import fs from 'node:fs/promises'

const NSIS_INST_SIG = Buffer.from([
  0xef, 0xbe, 0xad, 0xde, 0x4e, 0x75, 0x6c, 0x6c, 0x73, 0x6f, 0x66, 0x74, 0x49, 0x6e, 0x73, 0x74,
])

/** @param {Buffer} buffer */
export function computeNsisPayloadOffset(buffer) {
  if (buffer.length < 128 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    throw new Error('Arquivo não é PE (assinatura MZ ausente).')
  }
  const peOffset = buffer.readUInt32LE(60)
  if (peOffset <= 0 || peOffset + 24 >= buffer.length) {
    throw new Error('e_lfanew PE inválido.')
  }
  let pos = peOffset
  if (buffer.readUInt32LE(pos) !== 0x00004550) {
    throw new Error('Assinatura PE inválida.')
  }
  pos += 4
  pos += 2
  const numberOfSections = buffer.readUInt16LE(pos)
  pos += 2
  pos += 12
  const sizeOfOptionalHeader = buffer.readUInt16LE(pos)
  pos += 2
  pos += 2
  pos += sizeOfOptionalHeader

  let nsisOffset = 0
  for (let i = 0; i < numberOfSections; i++) {
    if (pos + 40 > buffer.length) {
      throw new Error('Tabela de seções PE truncada.')
    }
    const name = buffer.toString('ascii', pos, pos + 8).replace(/\0.*$/, '')
    pos += 8
    pos += 8
    const rawSize = buffer.readUInt32LE(pos)
    pos += 4
    const rawPointer = buffer.readUInt32LE(pos)
    pos += 4
    pos += 16
    switch (name) {
      case '.text':
      case '.rdata':
      case '.data':
      case '.rsrc':
      case '.ndata':
        nsisOffset = Math.max(rawPointer + rawSize, nsisOffset)
        break
      default:
        if (rawPointer !== 0 && rawSize !== 0) {
          throw new Error(`Seção PE não suportada pelo validador NSIS: ${JSON.stringify(name)}`)
        }
        break
    }
  }
  if (nsisOffset <= 0 || nsisOffset >= buffer.length) {
    throw new Error('Offset do payload NSIS inválido.')
  }
  return nsisOffset
}

/** @param {Buffer} buffer */
export function validateNsisUninstallerBuffer(buffer) {
  const nsisOffset = computeNsisPayloadOffset(buffer)
  const nsisSize = buffer.length - nsisOffset
  if (nsisSize < 32_000) {
    throw new Error(`Payload NSIS pequeno demais (${nsisSize} bytes).`)
  }
  let pos = nsisOffset
  pos += 4
  if (!buffer.subarray(pos, pos + NSIS_INST_SIG.length).equals(NSIS_INST_SIG)) {
    throw new Error('Assinatura NsisInst ausente no payload.')
  }
  pos += NSIS_INST_SIG.length
  pos += 4
  const declaredTotal = buffer.readUInt32LE(pos)
  if (declaredTotal !== nsisSize) {
    throw new Error(
      `Tamanho NSIS incoerente: cabeçalho=${declaredTotal} anexo=${nsisSize} (artefato truncado ou extraído via UninstallerReader).`,
    )
  }
  const minTotalBytes = 165_000
  if (buffer.length < minTotalBytes) {
    throw new Error(
      `Desinstalador total pequeno demais (${buffer.length} < ${minTotalBytes}) — provável stub incompleto.`,
    )
  }
  return { nsisOffset, nsisSize, totalBytes: buffer.length }
}

/** @param {string} filePath */
export async function validateNsisUninstallerArtifact(filePath) {
  const buffer = await fs.readFile(filePath)
  const meta = validateNsisUninstallerBuffer(buffer)
  return { filePath, ...meta }
}
