import { Hono } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { QuantityInput } from '../products/conversion.types'
import type { AppEnv } from '../../types/context'
import { PosService } from './pos.service'

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be an object')
  }

  return value as Record<string, unknown>
}

function optionalLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) {
    throw new Error('POS search limit must be between 1 and 50')
  }

  return parsed
}

function quantityInput(value: unknown): QuantityInput | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('quantity must be an object')
  }

  return value as QuantityInput
}

function canViewPos(c: { get: (key: 'permissions') => string[] }): boolean {
  return c.get('permissions').includes('POS_VIEW')
}

export const posRoutes = new Hono<AppEnv>()
  .get('/pos/bootstrap', async (c) => {
    if (!canViewPos(c)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    return withRequestDatabase(c.env, async (database) =>
      c.json(
        await new PosService(
          c.get('tenantId'),
          database,
        ).bootstrap(c.get('permissions')),
      ),
    )
  })
  .get('/pos/products', async (c) => {
    if (!canViewPos(c)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new PosService(
            c.get('tenantId'),
            database,
          ).searchProductsForClient(
            c.req.query('search') ?? '',
            {
              limit: optionalLimit(c.req.query('limit')),
              permissions: c.get('permissions'),
            },
          ),
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
  .get('/pos/products/:variantId', async (c) => {
    if (!canViewPos(c)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      return await withRequestDatabase(c.env, async (database) => {
        const variantId = c.req.param('variantId')
        const products = await new PosService(
          c.get('tenantId'),
          database,
        ).searchProductsForClient(variantId, {
          limit: 1,
          permissions: c.get('permissions'),
        })
        const product = products.find((candidate) => candidate.variantId === variantId)
        return product
          ? c.json(product)
          : c.json({ error: 'Product Variant is no longer available.' }, 404)
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
  .get('/pos/customers', async (c) => {
    if (!canViewPos(c)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new PosService(
            c.get('tenantId'),
            database,
          ).searchCustomers(
            c.req.query('search') ?? '',
            optionalLimit(c.req.query('limit')),
          ),
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
  .post('/pos/quote-line', async (c) => {
    if (!canViewPos(c)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())
      const variantId =
        typeof body.variantId === 'string' ? body.variantId : ''
      const baseQty =
        typeof body.baseQty === 'string' ? body.baseQty : undefined
      const businessDate =
        typeof body.businessDate === 'string'
          ? body.businessDate
          : undefined

      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new PosService(
            c.get('tenantId'),
            database,
          ).quoteLine(
            {
              variantId,
              baseQty,
              businessDate,
              quantity: quantityInput(body.quantity),
            },
            c.get('permissions'),
          ),
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
