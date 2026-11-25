import { useEffect, useState } from 'react'
import { applyTheme, persistTheme, readStoredTheme, type ThemeMode } from '../theme/themePreference.ts'

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme())

  useEffect(() => {
    applyTheme(theme)
    persistTheme(theme)
  }, [theme])

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      aria-pressed={theme === 'dark'}
      onClick={toggleTheme}
    >
      <span className={theme === 'light' ? 'theme-toggle-icon is-active' : 'theme-toggle-icon'} aria-hidden="true">
        <SunIcon />
      </span>
      <span className={theme === 'dark' ? 'theme-toggle-icon is-active' : 'theme-toggle-icon'} aria-hidden="true">
        <MoonIcon />
      </span>
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 14.5A7.5 7.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />
    </svg>
  )
}
