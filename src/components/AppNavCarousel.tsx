import { AppHeaderActions } from './AppHeaderActions.tsx'
import { APP_NAV_CATALOG, type AppNavCatalogEntry } from '../config/appNavCatalog.ts'
import { isSystemsNavHidden } from '../utils/packagedBundledOmps.ts'
import type { AppView } from '../types/navigation.ts'

type AppNavCarouselProps = {
  currentView: AppView | null
  onSelectView: (view: AppView) => void
}

export function AppNavCarousel({ currentView, onSelectView }: AppNavCarouselProps) {
  const catalogEntries = isSystemsNavHidden()
    ? APP_NAV_CATALOG.filter((entry) => entry.view !== 'sistemas')
    : APP_NAV_CATALOG

  function handlePanelActivate(entry: AppNavCatalogEntry) {
    if (entry.view != null && !entry.developmentOnly) {
      onSelectView(entry.view)
    }
  }

  return (
    <section className="nav-carousel-shell" aria-label="Catálogo de seções">
      <div className="nav-catalog-grid">
        {catalogEntries.map((entry) => (
          <NavCatalogCard
            key={entry.id}
            entry={entry}
            isActiveRoute={entry.view != null && entry.view === currentView}
            onActivate={() => handlePanelActivate(entry)}
          />
        ))}
      </div>

      <div className="nav-carousel-theme">
        <AppHeaderActions onOpenSettings={() => onSelectView('configuracoes')} />
      </div>
    </section>
  )
}

type NavCatalogCardProps = {
  entry: AppNavCatalogEntry
  isActiveRoute: boolean
  onActivate: () => void
}

function NavCatalogCard({ entry, isActiveRoute, onActivate }: NavCatalogCardProps) {
  const navigable = entry.view != null && !entry.developmentOnly
  const className = [
    'nav-carousel-panel',
    navigable ? 'nav-carousel-panel-selectable' : 'nav-carousel-panel-development',
    isActiveRoute ? 'nav-carousel-panel-route-active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      <div className="nav-carousel-panel-media">
        <img src={entry.imageSrc} alt="" className="nav-carousel-panel-image" loading="lazy" decoding="async" />
      </div>
      <div className="nav-carousel-panel-body">
        <h2 className="nav-carousel-panel-title">{entry.title}</h2>
      </div>
    </>
  )

  if (navigable) {
    return (
      <button type="button" className={className} onClick={onActivate}>
        {body}
      </button>
    )
  }

  return (
    <article className={className} aria-disabled="true">
      {body}
    </article>
  )
}
