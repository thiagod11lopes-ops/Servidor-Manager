import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isLocalhostOnlyProxyPath,
  isLoopbackRemoteAddress,
  localhostOnlyForbiddenJsonBody,
} from './manager-localhost-only-guard.mjs'
import { validateManagerUiBundle } from './validate-manager-ui-bundle.mjs'

const uiRoot = process.argv[2]
const port = Number(process.env.SM_UI_PORT ?? 5199)
const apiBase = (process.env.SM_LOCAL_SERVICE_URL ?? 'http://127.0.0.1:47831').replace(/\/+$/, '')
const proxyTimeoutMs = Number(process.env.SM_PROXY_UPSTREAM_TIMEOUT_MS ?? 900_000)
const probeTimeoutMs = Number(process.env.SM_PROXY_PROBE_TIMEOUT_MS ?? 4_000)

function sendLocalhostOnlyProxyForbidden(res) {
  res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(localhostOnlyForbiddenJsonBody())
}

if (!uiRoot) {
  console.error('Uso: node serve-manager-ui.mjs <pasta-dist>')
  process.exit(1)
}

const uiValidation = validateManagerUiBundle(uiRoot)
if (!uiValidation.ok) {
  console.error(
    'Interface inválida em resources/ui-dist — não iniciar servidor HTTP com cópia quebrada.',
  )
  console.error(JSON.stringify(uiValidation, null, 2))
  process.exit(1)
}

if (process.env.SM_UI_SOURCE_LOG !== '0') {
  console.log(
    `UI bundle OK (${uiValidation.mainJsAsset ?? 'assets'}) — launcher: ${fileURLToPath(import.meta.url)}`,
  )
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function probeLocalService() {
  return new Promise((resolve) => {
    let settled = false
    const done = (alive) => {
      if (settled) return
      settled = true
      resolve(alive)
    }
    const req = http.get(
      `${apiBase}/api/v1/diagnostics/server-info`,
      { timeout: probeTimeoutMs },
      (upstream) => {
        upstream.resume()
        done((upstream.statusCode ?? 500) < 500)
      },
    )
    req.on('timeout', () => {
      req.destroy()
      done(false)
    })
    req.on('error', () => done(false))
  })
}

async function reportUpstreamFailure(res, error) {
  if (res.headersSent || res.writableEnded) return
  const detail = error instanceof Error ? error.message : String(error)
  const alive = await probeLocalService()
  if (res.headersSent || res.writableEnded) return
  if (alive) {
    res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        ok: false,
        message:
          'O serviço local (47831) respondeu à verificação HTTP, mas esta operação não terminou no tempo limite. Atualize o progresso antes de iniciar outra instalação.',
        detail,
      }),
    )
    return
  }
  res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(
    JSON.stringify({
      ok: false,
      message:
        'Servico local (47831) indisponivel. Feche o Manager e abra de novo pelo atalho Servidor Manager.',
      detail,
    }),
  )
}

function proxyApiRequest(req, res, pathname, search) {
  const targetUrl = new URL(`${apiBase}${pathname}${search}`)
  const headers = {
    Accept: req.headers.accept ?? 'application/json',
  }
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type']
  }

  return new Promise((resolve, reject) => {
    const startUpstream = (body) => {
      if (body?.length) headers['Content-Length'] = String(body.length)
      const upstreamReq = http.request(
        {
          protocol: targetUrl.protocol,
          hostname: targetUrl.hostname,
          port: targetUrl.port,
          path: `${targetUrl.pathname}${targetUrl.search}`,
          method: req.method,
          headers,
          timeout: proxyTimeoutMs,
        },
        (upstream) => {
          const chunks = []
          upstream.on('data', (chunk) => chunks.push(chunk))
          upstream.on('end', () => {
            if (!res.headersSent && !res.writableEnded) {
              res.writeHead(upstream.statusCode ?? 502, {
                'Content-Type':
                  upstream.headers['content-type'] ?? 'application/json; charset=utf-8',
              })
              res.end(Buffer.concat(chunks))
            }
            resolve()
          })
          upstream.on('error', (error) => {
            reportUpstreamFailure(res, error).then(resolve, reject)
          })
        },
      )
      upstreamReq.on('timeout', () => {
        upstreamReq.destroy(new Error(`tempo esgotado apos ${proxyTimeoutMs}ms`))
      })
      upstreamReq.on('error', (error) => {
        reportUpstreamFailure(res, error).then(resolve, reject)
      })
      if (body?.length) upstreamReq.write(body)
      upstreamReq.end()
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      startUpstream(undefined)
      return
    }
    readRequestBody(req).then(startUpstream, reject)
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

    if (url.pathname.startsWith('/api/v1/')) {
      if (
        isLocalhostOnlyProxyPath(url.pathname) &&
        !isLoopbackRemoteAddress(req.socket?.remoteAddress)
      ) {
        sendLocalhostOnlyProxyForbidden(res)
        return
      }
      await proxyApiRequest(req, res, url.pathname, url.search)
      return
    }

    let rel = decodeURIComponent(url.pathname)
    if (rel.endsWith('/')) rel += 'index.html'
    const filePath = path.normalize(path.join(uiRoot, rel.replace(/^\//, '')))
    if (!filePath.startsWith(path.normalize(uiRoot))) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    let data
    try {
      data = await fs.readFile(filePath)
    } catch {
      data = await fs.readFile(path.join(uiRoot, 'index.html'))
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      })
      res.end(data)
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    const relPath = rel.replace(/^\//, '').replace(/\\/g, '/')
    const isNavAsset = relPath.startsWith('nav/')
    const cacheControl =
      ext === '.html' || isNavAsset ? 'no-cache' : 'public, max-age=3600'
    res.writeHead(200, {
      'Content-Type': mime[ext] ?? 'application/octet-stream',
      'Cache-Control': cacheControl,
    })
    res.end(data)
  } catch (error) {
    res.writeHead(500)
    res.end(error instanceof Error ? error.message : 'Erro interno')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Servidor Manager UI: http://127.0.0.1:${port}/ (proxy /api/v1 -> ${apiBase})`)
})
