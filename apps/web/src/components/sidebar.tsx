import { Link } from '@tanstack/react-router'
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  LayoutDashboard,
  ReceiptText,
  ShoppingCart,
  Store,
  Users,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from './ui/sidebar'

const navigationItems = [
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    to: '/app' as const,
    exact: true,
  },
  { icon: ShoppingCart, label: 'Sales' },
  { icon: ReceiptText, label: 'Purchases' },
  { icon: Boxes, label: 'Products', to: '/app/products' as const },
  { icon: Users, label: 'Parties' },
  { icon: CircleDollarSign, label: 'Expenses' },
  { icon: Store, label: 'Finance' },
  { icon: BarChart3, label: 'Reports' },
]
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="app-sidebar-brand">
          <span className="app-sidebar-brand-mark">S</span>
          <div className="app-sidebar-brand-copy">
            <strong>SherHisab</strong>
            <small>Business ERP</small>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Business</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Primary navigation">
              <SidebarMenu>
              {navigationItems.map((item) => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={item.label}>
                    {item.to ? (
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                      >
                        <Link
                          activeOptions={{ exact: item.exact ?? false }}
                          activeProps={{ className: 'is-active' }}
                          to={item.to}
                        >
                          <Icon aria-hidden="true" size={16} />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        aria-disabled="true"
                        disabled
                        tooltip={item.label}
                      >
                        <Icon aria-hidden="true" size={16} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                )
              })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
