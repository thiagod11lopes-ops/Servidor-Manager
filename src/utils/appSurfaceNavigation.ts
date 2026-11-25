import type { AppView } from '../types/navigation.ts'

export type AppSurface = AppView | 'catalog' | 'servidor-omps'

function surfaceFromRoutePath(pathname: string): AppSurface {
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '') || '/'
  if (path === '/servidor-omps') return 'servidor-omps'
  if (path === '/sistemas') return 'sistemas'
  if (path === '/atualizacao') return 'atualizacao'
  if (path === '/dashboard') return 'dashboard'
  if (path === '/banco-dados') return 'banco-dados'
  if (path === '/servidor') return 'servidor'
  if (path === '/armazenamento') return 'armazenamento'
  if (path === '/usuarios') return 'usuarios'
  if (path === '/configuracoes') return 'configuracoes'
  return 'catalog'
}

export function pathFromSurface(surface: AppSurface): string {
  if (surface === 'servidor-omps') return '/servidor-omps'
  if (surface === 'sistemas') return '/sistemas'
  if (surface === 'atualizacao') return '/atualizacao'
  if (surface === 'dashboard') return '/dashboard'
  if (surface === 'banco-dados') return '/banco-dados'
  if (surface === 'servidor') return '/servidor'
  if (surface === 'armazenamento') return '/armazenamento'
  if (surface === 'usuarios') return '/usuarios'
  if (surface === 'configuracoes') return '/configuracoes'
  return '/'
}

/** SPA empacotada (Electron loadFile, Vite preview em arquivo): rotas vivem no hash. */
export function usesHashAppRouting(location: Pick<Location, 'protocol' | 'pathname'>): boolean {
  if (location.protocol === 'file:') return true
  if (/\.html$/i.test(location.pathname)) return true
  return false
}

function readHashRoutePath(hash: string): string | null {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw) return null
  const routePart = raw.split('?')[0] ?? ''
  if (!routePart) return null
  return routePart.startsWith('/') ? routePart : `/${routePart}`
}

export function readSurfaceFromLocation(location: Location): AppSurface {
  if (usesHashAppRouting(location)) {
    const fromHash = readHashRoutePath(location.hash)
    if (fromHash) return surfaceFromRoutePath(fromHash)
    return 'catalog'
  }
  return surfaceFromRoutePath(location.pathname)
}

export function buildAppLocationHref(
  location: Pick<Location, 'pathname' | 'search' | 'protocol'>,
  surface: AppSurface,
  search?: string,
): string {
  const searchPart = search ? (search.startsWith('?') ? search : `?${search}`) : ''
  if (usesHashAppRouting(location)) {
    if (surface === 'catalog') {
      return `${location.pathname}${location.search}`
    }
    const route = `${pathFromSurface(surface)}${searchPart}`
    return `${location.pathname}${location.search}#${route}`
  }
  return `${pathFromSurface(surface)}${searchPart}`
}

export function applyAppSurfaceToHistory(
  location: Location,
  surface: AppSurface,
  search: string | undefined,
  mode: 'push' | 'replace',
): void {
  const nextHref = buildAppLocationHref(location, surface, search)
  const currentHref = usesHashAppRouting(location)
    ? `${location.pathname}${location.search}${location.hash}`
    : `${location.pathname}${location.search}`

  if (currentHref === nextHref) return

  if (mode === 'replace') {
    window.history.replaceState({}, '', nextHref)
  } else {
    window.history.pushState({}, '', nextHref)
  }
}

export function isAppView(surface: AppSurface): surface is AppView {
  return surface !== 'catalog' && surface !== 'servidor-omps'
}
