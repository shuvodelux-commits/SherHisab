import { Hono } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { AppEnv } from '../../types/context'
import { CustomerService } from './customer.service'

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

export const customerRoutes = new Hono<AppEnv>()
  .get('/customers', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    return withRequestDatabase(c.env, async (database) => {
      const service = new CustomerService(c.get('tenantId'), database)
      return c.json(await service.search(c.req.query('search') ?? ''))
    })
  })
  .post('/customers', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())

      return await withRequestDatabase(c.env, async (database) => {
        const service = new CustomerService(c.get('tenantId'), database)

        return c.json(
          await service.create({
            name: textField(body, 'name'),
            phone: textField(body, 'phone'),
            guardianName: textField(body, 'guardianName'),
            address: textField(body, 'address'),
          }),
          201,
        )
      })
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
  .get('/customers/:customerId/balance', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      return await withRequestDatabase(c.env, async (database) => {
        const service = new CustomerService(c.get('tenantId'), database)

        return c.json({
          balancePaisa: await service.balance(
            c.req.param('customerId'),
          ),
        })
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid request'

      if (message === 'Customer not found') {
        return c.json({ error: message }, 404)
      }

      return c.json({ error: message }, 400)
    }
  })
