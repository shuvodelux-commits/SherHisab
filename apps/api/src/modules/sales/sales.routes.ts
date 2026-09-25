import { Hono } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { AppEnv } from '../../types/context'
import { PosService } from '../pos/pos.service'
import {
  SalesConflictError,
  SalesPermissionError,
  SalesValidationError,
} from './sales.errors'
import { SalesService } from './sales.service'
import type {
  CommitSaleInput,
  SaleCustomerInput,
  SalesPaymentInput,
  SalesPaymentMethod,
} from './sales.types'

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

function customerInput(value: unknown): SaleCustomerInput | undefined {
  if (value === undefined) {
    return undefined
  }
  const body = objectBody(value)
  return {
    selectedCustomerId: optionalStringField(body, 'selectedCustomerId'),
    name: stringField(body, 'name'),
    phone: stringField(body, 'phone'),
    guardianName: optionalStringField(body, 'guardianName'),
    address: optionalStringField(body, 'address'),
  }
}

function paymentMethod(raw: string): SalesPaymentMethod {
  if (
    raw !== 'CASH' &&
    raw !== 'BANK' &&
    raw !== 'MOBILE_BANKING' &&
    raw !== 'CUSTOMER_CREDIT'
  ) {
    throw new SalesValidationError('Unsupported payment method.')
  }
  return raw
}

function paymentInput(value: unknown): SalesPaymentInput {
  const body = objectBody(value)
  return {
    clientLineId: stringField(body, 'clientLineId'),
    method: paymentMethod(stringField(body, 'method')),
    accountId: optionalStringField(body, 'accountId'),
    amountPaisa: stringField(body, 'amountPaisa'),
    reference: optionalStringField(body, 'reference'),
    note: optionalStringField(body, 'note'),
  }
}

function commitInput(body: Record<string, unknown>): CommitSaleInput {
  if (!Array.isArray(body.lines)) {
    throw new SalesValidationError('lines must be an array.')
  }
  if (body.payments !== undefined && !Array.isArray(body.payments)) {
    throw new SalesValidationError('payments must be an array.')
  }

  return {
    operationId: optionalStringField(body, 'operationId'),
    businessDate: stringField(body, 'businessDate'),
    customer: customerInput(body.customer),
    discountPaisa: optionalStringField(body, 'discountPaisa'),
    lines: body.lines.map((rawLine) => {
      const line = objectBody(rawLine)
      const manual = line.manualUnitSellingPricePaisa
      if (manual !== undefined && typeof manual !== 'string') {
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
    ...(body.payments === undefined
      ? {}
      : { payments: body.payments.map(paymentInput) }),
  }
}

export const salesRoutes = new Hono<AppEnv>()
  .post('/sales/quote-line', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new PosService(c.get('tenantId'), database).quoteLine(
            {
              variantId: stringField(body, 'variantId'),
              baseQty: stringField(body, 'baseQty'),
              businessDate: optionalStringField(body, 'businessDate'),
            },
            c.get('permissions'),
          ),
        ),
      )
    } catch (error) {
      if (error instanceof SalesValidationError) {
        return c.json({ error: error.message }, 400)
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })
  .post('/sales', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

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
      if (error instanceof SalesConflictError) {
        return c.json({ error: error.message }, 409)
      }
      if (error instanceof SalesValidationError) {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })
