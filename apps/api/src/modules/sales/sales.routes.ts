import { Hono } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { AppEnv } from '../../types/context'
import {
  SalesPermissionError,
  SalesValidationError,
} from './sales.errors'
import { SalesPricingService } from './sales-pricing.service'
import { SalesService } from './sales.service'
import type { CommitSaleInput } from './sales.types'

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SalesValidationError('Request body must be an object.')
  }

  return value as Record<string, unknown>
}

function stringField(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = body[key]

  if (typeof value !== 'string') {
    throw new SalesValidationError(`${key} is required.`)
  }

  return value
}

function optionalStringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key]

  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new SalesValidationError(`${key} must be a string.`)
  }

  return value
}

function commitInput(body: Record<string, unknown>): CommitSaleInput {
  if (!Array.isArray(body.lines)) {
    throw new SalesValidationError('lines must be an array.')
  }

  return {
    businessDate: stringField(body, 'businessDate'),
    lines: body.lines.map((rawLine) => {
      const line = objectBody(rawLine)
      const manual = line.manualUnitSellingPricePaisa

      if (
        manual !== undefined &&
        typeof manual !== 'string'
      ) {
        throw new SalesValidationError(
          'manualUnitSellingPricePaisa must be a string.',
        )
      }

      return {
        variantId: stringField(line, 'variantId'),
        baseQty: stringField(line, 'baseQty'),
        ...(manual === undefined
          ? {}
          : { manualUnitSellingPricePaisa: manual }),
      }
    }),
  }
}

export const salesRoutes = new Hono<AppEnv>()
  .post('/sales/quote-line', async (c) => {
    try {
      const body = objectBody(await c.req.json())

      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new SalesPricingService(database).quoteFifoLine(
            c.get('tenantId'),
            stringField(body, 'variantId'),
            stringField(body, 'baseQty'),
            optionalStringField(body, 'businessDate'),
          ),
        ),
      )
    } catch (error) {
      if (error instanceof SalesValidationError) {
        return c.json({ error: error.message }, 400)
      }

      throw error
    }
  })
  .post('/sales', async (c) => {
    try {
      const body = objectBody(await c.req.json())
      const input = commitInput(body)
      const canOverride = c
        .get('permissions')
        .includes('SALES_OVERRIDE_SELLING_PRICE')

      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new SalesService(database).commitSale(
            c.get('tenantId'),
            c.get('userId'),
            canOverride,
            input,
          ),
          201,
        ),
      )
    } catch (error) {
      if (error instanceof SalesPermissionError) {
        return c.json({ error: error.message }, 403)
      }

      if (error instanceof SalesValidationError) {
        return c.json({ error: error.message }, 400)
      }

      throw error
    }
  })
