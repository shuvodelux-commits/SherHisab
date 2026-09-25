import { Hono } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { AppEnv } from '../../types/context'
import { CashSessionService } from './cash-session.service'
import { FinanceRepository } from './finance.repository'
import type { FinancialAccountType } from './finance.types'

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

export const financeRoutes = new Hono<AppEnv>()
  .get('/financial-accounts', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    return withRequestDatabase(c.env, async (database) =>
      c.json(
        await new FinanceRepository(database).listAccounts(
          c.get('tenantId'),
          c.req.query('includeInactive') === 'true',
        ),
      ),
    )
  })
  .post('/financial-accounts', async (c) => {
    if (!ownerOrAdmin(c.get('role'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())

      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new FinanceRepository(database).createAccount({
            tenantId: c.get('tenantId'),
            type: textField(body, 'type') as FinancialAccountType,
            name: textField(body, 'name'),
            provider: textField(body, 'provider'),
            accountReference: textField(
              body,
              'accountReference',
            ),
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
  .patch('/financial-accounts/:accountId', async (c) => {
    if (!ownerOrAdmin(c.get('role'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())
      const account = await withRequestDatabase(
        c.env,
        async (database) =>
          new FinanceRepository(database).updateAccount(
            c.get('tenantId'),
            c.req.param('accountId'),
            {
              name: textField(body, 'name'),
              provider: textField(body, 'provider'),
              accountReference: textField(
                body,
                'accountReference',
              ),
              isActive: boolField(body, 'isActive'),
            },
          ),
      )

      if (!account) {
        return c.json(
          { error: 'Financial account not found' },
          404,
        )
      }

      return c.json(account)
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
  .get('/cash-sessions/active', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    return withRequestDatabase(c.env, async (database) =>
      c.json(
        await new CashSessionService(
          c.get('tenantId'),
          database,
        ).getActive(),
      ),
    )
  })
  .post('/cash-sessions/open', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())

      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new CashSessionService(
            c.get('tenantId'),
            database,
          ).open({
            openingCashPaisa: textField(
              body,
              'openingCashPaisa',
            ),
            actorUserId: c.get('userId'),
            notes: textField(body, 'notes'),
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
  .post('/cash-sessions/close', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())

      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new CashSessionService(
            c.get('tenantId'),
            database,
          ).close({
            countedCashPaisa: textField(
              body,
              'countedCashPaisa',
            ),
            actorUserId: c.get('userId'),
            notes: textField(body, 'notes'),
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
