import type { ReactNode } from 'react'
import { AppSidebar } from './sidebar'
import { Topbar } from './topbar'
import {
  SidebarInset,
  SidebarProvider,
} from './ui/sidebar'

interface AppShellProps {
  children: ReactNode
  pathname?: string
}

export function AppShell({
  children,
  pathname = '/app',
}: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar pathname={pathname} />
        <div className="app-shell-content">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
