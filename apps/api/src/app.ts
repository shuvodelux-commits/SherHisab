import { Hono } from 'hono'
import { authContextMiddleware } from './middleware/auth-context'
import { authRoutes } from './modules/auth/auth.routes'
import { customerRoutes } from './modules/customers/customer.routes'
import { financeRoutes } from './modules/finance/finance.routes'
import { productRoutes } from './modules/products/product.routes'
import { salesRoutes } from './modules/sales/sales.routes'
import { posSettingsRoutes } from './modules/settings/pos-settings.routes'
import { vendorRoutes } from './modules/vendors/vendor.routes'
import { healthRoutes } from './routes/health'
import type { AppEnv } from './types/context'

const privateRoutes = new Hono<AppEnv>()
  .use('*', authContextMiddleware)
  .post('/context', (c) =>
    c.json({
      userId: c.get('userId'),
      tenantId: c.get('tenantId'),
      role: c.get('role'),
      permissions: c.get('permissions'),
    }),
  )
  .route('/', productRoutes)
  .route('/', salesRoutes)
  .route('/', customerRoutes)
  .route('/', vendorRoutes)
  .route('/', financeRoutes)
  .route('/', posSettingsRoutes)

export const app = new Hono<AppEnv>()
  .route('/api', healthRoutes)
  .route('/api/auth', authRoutes)
  .route('/api/private', privateRoutes)
