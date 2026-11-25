import type { IncomingMessage } from 'node:http'

export type ParsedMultipartFile = {
  fieldName: string
  filename: string
  data: Buffer
}

export type ParsedMultipartForm = {
  fields: Record<string, string>
  files: ParsedMultipartFile[]
}

function parseContentType(contentType: string | undefined): string | null {
  if (!contentType) return null
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  return match ? (match[1] ?? match[2] ?? null) : null
}

function parseContentDisposition(value: string): {
  name?: string
  filename?: string
} {
  const out: { name?: string; filename?: string } = {}
  for (const part of value.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim().toLowerCase()
    let val = trimmed.slice(eq + 1).trim()
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1)
    }
    if (key === 'name') out.name = val
    if (key === 'filename') out.filename = val
  }
  return out
}

export async function readMultipartFormData(
  req: IncomingMessage,
  options: { maxBytes: number; maxFiles: number; maxFileBytes: number },
): Promise<ParsedMultipartForm> {
  const boundary = parseContentType(req.headers['content-type'])
  if (!boundary) {
    throw new Error('INVALID_MULTIPART')
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > options.maxBytes) {
      throw new Error('BODY_TOO_LARGE')
    }
    chunks.push(buffer)
  }

  const body = Buffer.concat(chunks)
  const delimiter = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let offset = 0
  while (offset < body.length) {
    const start = body.indexOf(delimiter, offset)
    if (start === -1) break
    const afterDelimiter = start + delimiter.length
    if (body[afterDelimiter] === 0x2d && body[afterDelimiter + 1] === 0x2d) break
    let partStart = afterDelimiter
    if (body[partStart] === 0x0d && body[partStart + 1] === 0x0a) {
      partStart += 2
    }
    const next = body.indexOf(delimiter, partStart)
    const partEnd = next === -1 ? body.length : next
    let sliceEnd = partEnd
    if (sliceEnd >= 2 && body[sliceEnd - 2] === 0x0d && body[sliceEnd - 1] === 0x0a) {
      sliceEnd -= 2
    }
    parts.push(body.subarray(partStart, sliceEnd))
    offset = next === -1 ? body.length : next
  }

  const fields: Record<string, string> = {}
  const files: ParsedMultipartFile[] = []

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue
    const headerText = part.subarray(0, headerEnd).toString('utf8')
    const data = part.subarray(headerEnd + 4)
    const headers = headerText.split('\r\n')
    let disposition = ''
    for (const line of headers) {
      const colon = line.indexOf(':')
      if (colon === -1) continue
      const name = line.slice(0, colon).trim().toLowerCase()
      const value = line.slice(colon + 1).trim()
      if (name === 'content-disposition') disposition = value
    }
    if (!disposition) continue
    const parsed = parseContentDisposition(disposition)
    const fieldName = parsed.name ?? 'field'
    if (parsed.filename !== undefined) {
      if (files.length >= options.maxFiles) {
        throw new Error('TOO_MANY_FILES')
      }
      if (data.length > options.maxFileBytes) {
        throw new Error('FILE_TOO_LARGE')
      }
      files.push({
        fieldName,
        filename: parsed.filename,
        data,
      })
    } else {
      fields[fieldName] = data.toString('utf8')
    }
  }

  return { fields, files }
}
