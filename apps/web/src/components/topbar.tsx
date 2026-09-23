import { useLanguageMode } from '../app/language'
import { useThemeMode } from '../app/theme'

interface TopbarProps {
  onOpenMenu: () => void
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { mode: languageMode, setMode: setLanguageMode } = useLanguageMode()
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode()

  return (
    <header className="topbar">
      <button
        aria-label="Open navigation"
        className="topbar-menu-button"
        onClick={onOpenMenu}
        type="button"
      >
        ☰
      </button>

      <div className="topbar-title">
        <strong>Dashboard</strong>
        <span>Foundation workspace</span>
      </div>

      <div className="topbar-actions">
        <label className="topbar-select-wrap">
          <span className="sr-only">Language</span>
          <select
            aria-label="Language"
            className="topbar-select"
            onChange={(event) =>
              setLanguageMode(
                event.target.value as 'en-bn' | 'en' | 'bn',
              )
            }
            value={languageMode}
          >
            <option value="en-bn">English + বাংলা</option>
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
          </select>
        </label>

        <label className="topbar-select-wrap">
          <span className="sr-only">Theme</span>
          <select
            aria-label="Theme"
            className="topbar-select"
            onChange={(event) =>
              setThemeMode(
                event.target.value as 'light' | 'dark' | 'system',
              )
            }
            value={themeMode}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <button type="button">Search</button>
        <button type="button">Account</button>
      </div>
    </header>
  )
}
