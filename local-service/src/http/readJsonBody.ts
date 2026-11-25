import type { IncomingMessage } from 'node:http'

const MAX_BODY_BYTES = 16 * 1024

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) {
      throw new Error('BODY_TOO_LARGE')
    }
    chunks.push(buffer)
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    throw new Error('EMPTY_BODY')
  }

  return JSON.parse(raw) as T
}
