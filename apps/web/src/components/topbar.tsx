import { useLanguageMode } from '../app/language'
import { useThemeMode } from '../app/theme'

interface TopbarProps {
  onOpenMenu: () => void
  pathname?: string
}

function pageMeta(pathname: string) {
  if (pathname.startsWith('/app/products')) {
    return {
      en: 'Products',
      bn: 'পণ্য ও স্টক',
    }
  }

  return {
    en: 'Dashboard',
    bn: 'আজকের অবস্থা',
  }
}

export function Topbar({
  onOpenMenu,
  pathname = '/app',
}: TopbarProps) {
  const { mode: languageMode, setMode: setLanguageMode } = useLanguageMode()
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode()
  const meta = pageMeta(pathname)

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
        <strong lang={languageMode === 'bn' ? 'bn' : undefined}>
          {languageMode === 'bn' ? meta.bn : meta.en}
        </strong>
        {languageMode === 'en-bn' ? (
          <span lang="bn">{meta.bn}</span>
        ) : null}
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
