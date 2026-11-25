import type { AppView } from '../types/navigation.ts'
import { applyAppSurfaceToHistory, readSurfaceFromLocation } from './appSurfaceNavigation.ts'
import type { ChecklistActionTarget } from './serverOperationalChecklist.ts'

function navigateToView(view: AppView) {
  if (readSurfaceFromLocation(window.location) === view) return
  applyAppSurfaceToHistory(window.location, view, undefined, 'push')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function scrollToElement(id: string) {
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  })
}

export type ChecklistActionHandlers = {
  onRefreshRuntime?: () => void
}

export function runChecklistAction(target: ChecklistActionTarget, handlers: ChecklistActionHandlers = {}) {
  switch (target) {
    case 'dashboard_bootstrap':
      navigateToView('dashboard')
      scrollToElement('server-bootstrap-panel')
      return
    case 'analyze_install':
      scrollToElement('system-checklist-actions')
      return
    case 'start_system':
      scrollToElement('system-runtime-panel')
      return
    case 'refresh_runtime':
      scrollToElement('system-runtime-panel')
      handlers.onRefreshRuntime?.()
      return
  }
}
