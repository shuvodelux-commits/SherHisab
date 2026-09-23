import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppShell } from '../components/app-shell'
import { getSession } from '../features/auth-api'
import { LoginPage } from '../features/login-page'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  const queryClient = useQueryClient()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const sessionQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: getSession,
    retry: false,
    staleTime: 60_000,
  })

  if (sessionQuery.isPending) {
    return (
      <main className="auth-page">
        <div className="auth-loading" role="status">
          Checking session…
        </div>
      </main>
    )
  }

  if (sessionQuery.isError) {
    return (
      <main className="auth-page">
        <section className="auth-panel auth-panel-message">
          <h1>Unable to verify session</h1>
          <p>{sessionQuery.error.message}</p>
          <button
            className="ui-button ui-button-secondary ui-button-normal"
            onClick={() => sessionQuery.refetch()}
            type="button"
          >
            Retry
          </button>
        </section>
      </main>
    )
  }

  if (!sessionQuery.data) {
    return (
      <LoginPage
        onAuthenticated={async () => {
          await queryClient.invalidateQueries({
            queryKey: ['auth', 'session'],
          })
        }}
      />
    )
  }

  return <AppShell pathname={pathname}>{children}</AppShell>
}
