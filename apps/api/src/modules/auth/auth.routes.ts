import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { AuthService } from './auth.service'
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from './session'

const authService = new AuthService()

function secureCookieForRequest(url: string): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    new URL(url).protocol === 'https:'
  )
}

export const authRoutes = new Hono()
  .post('/login', async (c) => {
    let body: {
      tenantSlug?: string
      email?: string
      password?: string
    }

    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request' }, 400)
    }

    const login = await authService.login({
      tenantSlug: body.tenantSlug ?? '',
      email: body.email ?? '',
      password: body.password ?? '',
    })

    if (!login) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    setCookie(c, SESSION_COOKIE_NAME, login.token, {
      httpOnly: true,
      secure: secureCookieForRequest(c.req.url),
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    })

    return c.json({
      userId: login.userId,
      tenantId: login.tenantId,
      expiresAt: login.expiresAt.toISOString(),
    })
  })
  .get('/session', async (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME)

    if (!token) {
      return c.json({ authenticated: false }, 401)
    }

    const session = await authService.validateSession(token)

    if (!session) {
      deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
      return c.json({ authenticated: false }, 401)
    }

    return c.json({
      authenticated: true,
      userId: session.userId,
      tenantId: session.tenantId,
      expiresAt: session.expiresAt.toISOString(),
    })
  })
  .post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME)

    if (token) {
      await authService.logout(token)
    }

    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })

    return c.json({ ok: true })
  })
