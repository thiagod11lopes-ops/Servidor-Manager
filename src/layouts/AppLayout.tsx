import { useEffect, useState, type ReactNode } from 'react'
import { AppNavCarousel } from '../components/AppNavCarousel.tsx'
import { AppHeaderActions } from '../components/AppHeaderActions.tsx'
import { DashboardMetricsProvider } from '../contexts/DashboardMetricsContext.tsx'
import { ServerBootstrapProvider } from '../contexts/ServerBootstrapContext.tsx'
import { DashboardPage } from '../pages/DashboardPage.tsx'
import { ServerPage } from '../pages/ServerPage.tsx'
import { SystemsPage } from '../pages/SystemsPage.tsx'
import { UpdatesPage } from '../pages/UpdatesPage.tsx'
import { DatabaseBrowserPage } from '../pages/DatabaseBrowserPage.tsx'
import { UsersAdminPage } from '../pages/UsersAdminPage.tsx'
import { SettingsPage } from '../pages/SettingsPage.tsx'
import { BundledOmpsSetupPage } from '../pages/BundledOmpsSetupPage.tsx'
import { BundledOmpsNavPromo } from '../components/BundledOmpsNavPromo.tsx'
import type { AppView } from '../types/navigation.ts'
import { bundledOmpsFirstRunCompleted } from '../types/bundledOmps.ts'
import { fetchBundledOmpsStatusWithRetry } from '../utils/fetchBundledOmpsStatusWithRetry.ts'
import {
  isPackagedBundledOmpsProduct,
  isServidorOmpsServerProduct,
  isSystemsNavHidden,
} from '../utils/packagedBundledOmps.ts'
import {
  applyAppSurfaceToHistory,
  isAppView,
  readSurfaceFromLocation,
  type AppSurface,
} from '../utils/appSurfaceNavigation.ts'
import { useManagerDocumentTitle } from '../hooks/useManagerDocumentTitle.ts'
import { viewPageHeading } from '../utils/viewPageHeading.ts'

export type { AppSurface }

function queryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function buildServerSearch(systemId?: string | null): string {
  if (!systemId) return ''
  return `system=${encodeURIComponent(systemId)}`
}

function initialMountedViews(): Set<AppView> {
  const initial = readSurfaceFromLocation(window.location)
  if (!isAppView(initial)) return new Set()
  return new Set([initial])
}

function AppViewSlot({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  return (
    <div className="app-view-slot" hidden={!active} aria-hidden={!active}>
      {children}
    </div>
  )
}

function PersistentAppViews({
  surface,
  mountedViews,
  navigateTo,
  onOpenBundledOmpsSetup,
}: {
  surface: AppView
  mountedViews: Set<AppView>
  navigateTo: (nextSurface: AppSurface, search?: string) => void
  onOpenBundledOmpsSetup: () => void
}) {
  const focusSystemId = queryParam('system')

  function focusSystem(systemId: string) {
    navigateTo('servidor', buildServerSearch(systemId))
  }

  return (
    <>
      {mountedViews.has('dashboard') ? (
        <AppViewSlot active={surface === 'dashboard'}>
          <DashboardPage
            onOpenSystems={() => navigateTo(isSystemsNavHidden() ? 'dashboard' : 'sistemas')}
            showSystemsNav={!isSystemsNavHidden()}
            onOpenServer={(systemId) =>
              navigateTo('servidor', systemId ? buildServerSearch(systemId) : undefined)
            }
            onOpenBundledOmpsSetup={() => navigateTo('servidor-omps')}
          />
        </AppViewSlot>
      ) : null}
      {mountedViews.has('sistemas') && !isSystemsNavHidden() ? (
        <AppViewSlot active={surface === 'sistemas'}>
          <SystemsPage isActive={surface === 'sistemas'} onOpenBundledOmpsSetup={onOpenBundledOmpsSetup} />
        </AppViewSlot>
      ) : null}
      {mountedViews.has('atualizacao') ? (
        <AppViewSlot active={surface === 'atualizacao'}>
          <UpdatesPage />
        </AppViewSlot>
      ) : null}
      {mountedViews.has('servidor') || mountedViews.has('armazenamento') ? (
        <AppViewSlot active={surface === 'servidor' || surface === 'armazenamento'}>
          <ServerPage
            focusSystemId={focusSystemId}
            onNavigateUsers={(systemId) =>
              navigateTo('usuarios', `system=${encodeURIComponent(systemId)}`)
            }
            onFocusSystem={focusSystem}
          />
        </AppViewSlot>
      ) : null}
      {mountedViews.has('usuarios') ? (
        <AppViewSlot active={surface === 'usuarios'}>
          <UsersAdminPage initialSystemId={focusSystemId} />
        </AppViewSlot>
      ) : null}
      {mountedViews.has('banco-dados') ? (
        <AppViewSlot active={surface === 'banco-dados'}>
          <DatabaseBrowserPage initialSystemId={focusSystemId} />
        </AppViewSlot>
      ) : null}
      {mountedViews.has('configuracoes') ? (
        <AppViewSlot active={surface === 'configuracoes'}>
          <SettingsPage />
        </AppViewSlot>
      ) : null}
    </>
  )
}

export function AppLayout() {
  const [surface, setSurface] = useState<AppSurface>(() => readSurfaceFromLocation(window.location))
  const [mountedViews, setMountedViews] = useState<Set<AppView>>(() => initialMountedViews())

  useEffect(() => {
    function syncSurfaceFromLocation() {
      setSurface(readSurfaceFromLocation(window.location))
    }

    window.addEventListener('popstate', syncSurfaceFromLocation)
    window.addEventListener('hashchange', syncSurfaceFromLocation)
    return () => {
      window.removeEventListener('popstate', syncSurfaceFromLocation)
      window.removeEventListener('hashchange', syncSurfaceFromLocation)
    }
  }, [])

  useEffect(() => {
    if (surface !== 'catalog') return
    let cancelled = false
    void fetchBundledOmpsStatusWithRetry().then((status) => {
      if (cancelled) return
      const pendingFirstRun = !bundledOmpsFirstRunCompleted(status)
      const apiReady = status?.ok === true && status.available && pendingFirstRun
      const packagedPending =
        isPackagedBundledOmpsProduct() &&
        pendingFirstRun &&
        (status == null || (status.ok === true && status.available))
      if (!isServidorOmpsServerProduct() && (apiReady || packagedPending)) {
        applyAppSurfaceToHistory(window.location, 'servidor-omps', undefined, 'replace')
        setSurface('servidor-omps')
      }
    })
    return () => {
      cancelled = true
    }
  }, [surface])

  useEffect(() => {
    if (surface === 'servidor-omps' && isServidorOmpsServerProduct()) {
      applyAppSurfaceToHistory(window.location, 'dashboard', undefined, 'replace')
      setSurface('dashboard')
    }
  }, [surface])

  useEffect(() => {
    if (surface === 'sistemas' && isSystemsNavHidden()) {
      applyAppSurfaceToHistory(window.location, 'dashboard', undefined, 'replace')
      setSurface('dashboard')
    }
  }, [surface])

  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'
    const params = new URLSearchParams(window.location.search)
    const legacySection = params.get('section')
    if (path === '/armazenamento' || (path === '/servidor' && legacySection)) {
      const system = params.get('system')
      if (legacySection) params.delete('section')
      const search = system ? `system=${encodeURIComponent(system)}` : ''
      const target = search ? `/servidor?${search}` : '/servidor'
      if (`${path}${window.location.search}` !== target) {
        window.history.replaceState({}, '', target)
      }
      if (path === '/armazenamento') {
        setSurface('servidor')
      }
    }
  }, [])

  useEffect(() => {
    if (!isAppView(surface)) return
    setMountedViews((current) => {
      if (current.has(surface)) return current
      const next = new Set(current)
      next.add(surface)
      if (surface === 'armazenamento') next.add('servidor')
      if (surface === 'servidor') next.add('servidor')
      return next
    })
  }, [surface])

  function navigateTo(nextSurface: AppSurface, search?: string) {
    const target =
      nextSurface === 'sistemas' && isSystemsNavHidden() ? ('dashboard' satisfies AppSurface) : nextSurface
    applyAppSurfaceToHistory(window.location, target, search, 'push')
    setSurface(target)
  }

  function openView(view: AppView) {
    navigateTo(view)
  }

  const activeView = surface === 'catalog' || surface === 'servidor-omps' ? null : surface
  const carouselView =
    activeView === 'armazenamento' ? ('servidor' satisfies AppView) : activeView
  const pageHeading =
    surface === 'servidor-omps'
      ? isPackagedBundledOmpsProduct()
        ? null
        : {
            title: 'Servidor OMPS',
            subtitle: 'Instalação local a partir do payload empacotado — sem GitHub.',
          }
      : activeView
        ? viewPageHeading(activeView)
        : null

  const documentTitle =
    surface === 'servidor-omps'
      ? 'Instalar Servidor OMPS'
      : pageHeading?.title ?? null
  useManagerDocumentTitle(documentTitle)

  const hideTopBarForPackagedOmpsSetup =
    surface === 'servidor-omps' && isPackagedBundledOmpsProduct()

  return (
    <ServerBootstrapProvider>
      <DashboardMetricsProvider>
        <div className="app-shell app-shell-catalog">
          <div className="workspace workspace-full">
            {surface !== 'catalog' && !hideTopBarForPackagedOmpsSetup ? (
              <header className="topbar topbar-minimal topbar-app">
                {pageHeading ? (
                  <div className="topbar-page-heading">
                    <h1>{pageHeading.title}</h1>
                    <p>{pageHeading.subtitle}</p>
                  </div>
                ) : null}
                <div className="topbar-actions">
                  <button
                    type="button"
                    className="topbar-home-button"
                    onClick={() => navigateTo('catalog')}
                  >
                    Voltar ao catálogo
                  </button>
                  <AppHeaderActions onOpenSettings={() => navigateTo('configuracoes')} />
                </div>
              </header>
            ) : null}
            <main
              className={
                surface === 'catalog'
                  ? 'workspace-main workspace-main-catalog'
                  : surface === 'servidor' || surface === 'armazenamento'
                    ? 'workspace-main workspace-main-server'
                    : surface === 'dashboard'
                      ? 'workspace-main workspace-main-dashboard'
                      : surface === 'banco-dados'
                        ? 'workspace-main workspace-main-database'
                        : surface === 'sistemas'
                          ? 'workspace-main workspace-main-systems'
                          : surface === 'servidor-omps' && isPackagedBundledOmpsProduct()
                            ? 'workspace-main workspace-main-omps-setup'
                            : 'workspace-main'
              }
            >
              {surface === 'catalog' ? (
                <>
                  <BundledOmpsNavPromo onOpenSetup={() => navigateTo('servidor-omps')} />
                  <AppNavCarousel currentView={carouselView} onSelectView={openView} />
                </>
              ) : surface === 'servidor-omps' ? (
                <BundledOmpsSetupPage
                  onOpenSystems={() => navigateTo('sistemas')}
                  onOpenServer={(systemId) =>
                    navigateTo('servidor', buildServerSearch(systemId))
                  }
                />
              ) : isAppView(surface) ? (
                <PersistentAppViews
                  surface={surface}
                  mountedViews={mountedViews}
                  navigateTo={navigateTo}
                  onOpenBundledOmpsSetup={() => navigateTo('servidor-omps')}
                />
              ) : null}
            </main>
          </div>
        </div>
      </DashboardMetricsProvider>
    </ServerBootstrapProvider>
  )
}
