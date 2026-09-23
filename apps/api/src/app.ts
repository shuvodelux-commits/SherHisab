import { Hono } from 'hono'
import { authContextMiddleware } from './middleware/auth-context'
import { authRoutes } from './modules/auth/auth.routes'
import { productRoutes } from './modules/products/product.routes'
import { healthRoutes } from './routes/health'
import type { AppEnv } from './types/context'

const privateRoutes = new Hono<AppEnv>()
  .use('*', authContextMiddleware)
  .post('/context', (c) =>
    c.json({
      userId: c.get('userId'),
      tenantId: c.get('tenantId'),
    }),
  )
  .route('/', productRoutes)

export const app = new Hono<AppEnv>()
  .route('/api', healthRoutes)
  .route('/api/auth', authRoutes)
  .route('/api/private', privateRoutes)
