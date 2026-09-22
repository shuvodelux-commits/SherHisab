import { useState, type ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="app-shell">
      <div className="app-shell-desktop-sidebar">
        <Sidebar />
      </div>

      <div className="app-shell-main">
        <Topbar onOpenMenu={() => setMobileMenuOpen(true)} />
        <div className="app-shell-content">{children}</div>
      </div>

      {mobileMenuOpen ? (
        <div className="mobile-drawer" role="dialog" aria-label="Navigation menu">
          <button
            aria-label="Close navigation"
            className="mobile-drawer-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
          <div className="mobile-drawer-panel">
            <button
              aria-label="Close navigation"
              className="mobile-drawer-close"
              onClick={() => setMobileMenuOpen(false)}
              type="button"
            >
              ×
            </button>
            <Sidebar
              mobile
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
