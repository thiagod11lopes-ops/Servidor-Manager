import { SettingsIcon } from './Icons.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'

type AppHeaderActionsProps = {
  onOpenSettings: () => void
}

export function AppHeaderActions({ onOpenSettings }: AppHeaderActionsProps) {
  return (
    <div className="app-header-actions">
      <ThemeToggle />
      <button
        type="button"
        className="settings-gear-button"
        aria-label="Configurações"
        title="Configurações"
        onClick={onOpenSettings}
      >
        <SettingsIcon width={18} height={18} aria-hidden />
      </button>
    </div>
  )
}
