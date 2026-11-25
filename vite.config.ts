import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

// Manter alinhado com scripts/manager-localhost-only-guard.mjs (proxy producao + testes).

function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false
  if (remoteAddress === '127.0.0.1' || remoteAddress === '::1') return true
  if (remoteAddress.startsWith('::ffff:127.0.0.1')) return true
  return false
}

function isLocalhostOnlyApiPath(pathname: string): boolean {
  return /^\/api\/v1\/systems\/[^/]+\/remote-validation\//.test(pathname)
}

function localhostOnlyApiGuardMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (!isLocalhostOnlyApiPath(url.pathname)) {
    next()
    return
  }
  if (!isLoopbackRemoteAddress(req.socket?.remoteAddress)) {
    res.statusCode = 403
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'FORBIDDEN' }))
    return
  }
  next()
}

function managerBrandHtmlTitle(displayName: string): Plugin {
  return {
    name: 'manager-brand-html-title',
    transformIndexHtml(html) {
      return html.replace(/<title>[^<]*<\/title>/, `<title>${displayName}</title>`)
    },
  }
}

function managerLocalhostOnlyApiGuard(): Plugin {
  return {
    name: 'manager-localhost-only-api-guard',
    enforce: 'pre',
    configureServer(devServer) {
      devServer.middlewares.use(localhostOnlyApiGuardMiddleware)
    },
    configurePreviewServer(previewServer) {
      previewServer.middlewares.use(localhostOnlyApiGuardMiddleware)
    },
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

let managerProductDisplayName = 'Servidor Manager'
try {
  const brand = JSON.parse(
    readFileSync(new URL('./public/manager-brand.json', import.meta.url), 'utf8'),
  ) as { displayName?: string }
  if (brand.displayName?.trim()) managerProductDisplayName = brand.displayName.trim()
} catch {
  // default genérico
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __MANAGER_APP_VERSION__: JSON.stringify(pkg.version),
    __MANAGER_PRODUCT_DISPLAY_NAME__: JSON.stringify(managerProductDisplayName),
  },
  plugins: [react(), managerBrandHtmlTitle(managerProductDisplayName), managerLocalhostOnlyApiGuard()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:47831',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5199,
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:47831',
        changeOrigin: true,
      },
    },
  },
})
