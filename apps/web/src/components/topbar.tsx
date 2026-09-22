interface TopbarProps {
  onOpenMenu: () => void
}

export function Topbar({ onOpenMenu }: TopbarProps) {
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
        <button type="button">Search</button>
        <button type="button">Account</button>
      </div>
    </header>
  )
}
