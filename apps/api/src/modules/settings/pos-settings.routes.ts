import { Hono } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { AppEnv } from '../../types/context'
import { PosSettingsService } from './pos-settings.service'

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be an object')
  }

  return value as Record<string, unknown>
}

function boolField(
  body: Record<string, unknown>,
  key: string,
): boolean {
  const value = body[key]

  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean`)
  }

  return value
}

function ownerOrAdmin(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export const posSettingsRoutes = new Hono<AppEnv>()
  .get('/pos-settings', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    return withRequestDatabase(c.env, async (database) =>
      c.json(
        await new PosSettingsService(
          c.get('tenantId'),
          database,
        ).get(),
      ),
    )
  })
  .patch('/pos-settings', async (c) => {
    if (!ownerOrAdmin(c.get('role'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())

      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new PosSettingsService(
            c.get('tenantId'),
            database,
          ).update({
            showPurchasePrice: boolField(
              body,
              'showPurchasePrice',
            ),
            requireCashSession: boolField(
              body,
              'requireCashSession',
            ),
            invoiceShareEnabled: boolField(
              body,
              'invoiceShareEnabled',
            ),
          }),
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
