import { deleteCookie, getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { AuthService } from '../modules/auth/auth.service'
import { SESSION_COOKIE_NAME } from '../modules/auth/session'
import type { AppEnv } from '../types/context'

const authService = new AuthService()

export const authContextMiddleware = createMiddleware<AppEnv>(
  async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME)

    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const session = await authService.validateSession(token)

    if (!session) {
      deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
      return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('userId', session.userId)
    c.set('tenantId', session.tenantId)

    await next()
  },
)
