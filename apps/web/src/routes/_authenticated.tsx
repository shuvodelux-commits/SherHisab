import { useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppShell } from '../components/app-shell'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return <AppShell pathname={pathname}>{children}</AppShell>
}
