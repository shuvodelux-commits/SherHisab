import type { ReactNode } from 'react'
import { AppShell } from '../components/app-shell'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  return <AppShell>{children}</AppShell>
}
