import { Hono } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { AppEnv } from '../../types/context'
import { VendorService } from './vendor.service'

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be an object')
  }

  return value as Record<string, unknown>
}

function textField(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = body[key]
  return typeof value === 'string' ? value : ''
}

export const vendorRoutes = new Hono<AppEnv>()
  .post('/vendors', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())

      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new VendorService(
            c.get('tenantId'),
            database,
          ).create({
            name: textField(body, 'name'),
            phone: textField(body, 'phone'),
            address: textField(body, 'address'),
          }),
          201,
        ),
      )
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Invalid request',
        },
        400,
      )
    }
  })
  .get('/vendors/:vendorId', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new VendorService(
            c.get('tenantId'),
            database,
          ).get(c.req.param('vendorId')),
        ),
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid request'

      if (message === 'Vendor not found') {
        return c.json({ error: message }, 404)
      }

      return c.json({ error: message }, 400)
    }
  })
