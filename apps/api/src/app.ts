import { Hono } from 'hono'
import { authRoutes } from './modules/auth/auth.routes'
import { healthRoutes } from './routes/health'

export const app = new Hono()
  .route('/api', healthRoutes)
  .route('/api/auth', authRoutes)
