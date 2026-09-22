const navigationItems = [
  'Dashboard',
  'Sales',
  'Purchases',
  'Inventory',
  'Parties',
  'Expenses',
  'Finance',
  'Reports',
]

interface SidebarProps {
  mobile?: boolean
  onNavigate?: () => void
}

export function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  return (
    <aside className={mobile ? 'sidebar sidebar-mobile' : 'sidebar'}>
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">S</span>
        <div>
          <strong>SherHisab</strong>
          <small>Business ERP</small>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navigationItems.map((item, index) => (
          <button
            className={index === 0 ? 'sidebar-link is-active' : 'sidebar-link'}
            key={item}
            onClick={onNavigate}
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  )
}
