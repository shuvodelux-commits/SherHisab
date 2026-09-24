import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router'
import { PosPage } from '../features/pos/pos-page'
import { ProductPage } from '../features/products/product-page'
import { AuthenticatedLayout } from '../routes/_authenticated'
import { DashboardPage } from '../routes/_authenticated/index'

function RootLayout() {
  return <Outlet />
}

function HomePage() {
  return (
    <main>
      <h1>SherHisab</h1>
      <p>Foundation is running.</p>
      <Link to="/app">Open application shell</Link>
    </main>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: () => (
    <AuthenticatedLayout>
      <Outlet />
    </AuthenticatedLayout>
  ),
})

const dashboardRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  component: DashboardPage,
})

const productsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/products',
  component: ProductPage,
})

const posRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/pos',
  component: PosPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  authenticatedRoute.addChildren([
    dashboardRoute,
    posRoute,
    productsRoute,
  ]),
])

export const router = createRouter({
  routeTree,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
