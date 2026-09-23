import { Link } from '@tanstack/react-router'

const navigationItems = [
  { label: 'Dashboard', to: '/app' as const, exact: true },
  { label: 'Sales' },
  { label: 'Purchases' },
  { label: 'Products', to: '/app/products' as const },
  { label: 'Parties' },
  { label: 'Expenses' },
  { label: 'Finance' },
  { label: 'Reports' },
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
        {navigationItems.map((item) =>
          item.to ? (
            <Link
              activeOptions={{ exact: item.exact ?? false }}
              activeProps={{ className: 'sidebar-link is-active' }}
              className="sidebar-link"
              key={item.label}
              onClick={onNavigate}
              to={item.to}
            >
              {item.label}
            </Link>
          ) : (
            <button
              className="sidebar-link"
              key={item.label}
              onClick={onNavigate}
              type="button"
            >
              {item.label}
            </button>
          ),
        )}
      </nav>
    </aside>
  )
}
