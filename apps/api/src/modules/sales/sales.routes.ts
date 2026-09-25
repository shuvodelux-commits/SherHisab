import { Hono } from 'hono'
import { withRequestDatabase } from '../../db/request-database'
import type { AppEnv } from '../../types/context'
import { PosService } from '../pos/pos.service'
import {
  SalesConflictError,
  SalesPermissionError,
  SalesValidationError,
} from './sales.errors'
import { SalesDraftAccessError, SalesDraftVersionConflictError } from './sales-draft.errors'
import { SalesDraftService } from './sales-draft.service'
import type {
  SalesDraftInput,
  SalesDraftLineInput,
  SalesDraftPaymentState,
  SalesDraftQuantityInput,
} from './sales-draft.types'
import { SalesService } from './sales.service'
import type {
  CommitSaleInput,
  SaleCustomerInput,
  SalesPaymentInput,
  SalesPaymentMethod,
} from './sales.types'
import type { ShortageResolution } from './stock-source.types'

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

function positiveIntegerField(
  body: Record<string, unknown>,
  key: string,
): number {
  const value = body[key]
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new SalesValidationError(
      `${key} must be a positive integer.`,
    )
  }
  return value
}

function nullableString(
  value: unknown,
  label: string,
): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    throw new SalesValidationError(
      `${label} must be a string or null.`,
    )
  }
  return value
}

function stringRecord(
  value: unknown,
  label: string,
): Record<string, string> {
  const body = objectBody(value)
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(body)) {
    if (typeof item !== 'string') {
      throw new SalesValidationError(
        `${label} values must be strings.`,
      )
    }
    result[key] = item
  }
  return result
}

function draftQuantityInput(value: unknown): SalesDraftQuantityInput {
  const body = objectBody(value)
  const kind = stringField(body, 'kind')

  if (kind === 'SIMPLE') {
    return {
      kind: 'SIMPLE',
      baseQty: stringField(body, 'baseQty'),
    }
  }

  if (kind === 'COMPONENTS') {
    return {
      kind: 'COMPONENTS',
      profileId: stringField(body, 'profileId'),
      profileVersion: positiveIntegerField(body, 'profileVersion'),
      components: stringRecord(body.components, 'components'),
    }
  }

  throw new SalesValidationError('Unsupported Draft quantity kind.')
}

function draftPayment(value: unknown): SalesDraftPaymentState {
  const body = objectBody(value)
  return {
    clientLineId: stringField(body, 'clientLineId'),
    method: paymentMethod(stringField(body, 'method')),
    accountId: nullableString(body.accountId, 'accountId'),
    amountPaisa: stringField(body, 'amountPaisa'),
    reference: stringField(body, 'reference'),
    note: stringField(body, 'note'),
  }
}

function draftLine(value: unknown): SalesDraftLineInput {
  const body = objectBody(value)
  const normalized = objectBody(body.normalizedQuantitySnapshot)
  const pricingMode = stringField(body, 'pricingMode')

  if (pricingMode !== 'AUTO' && pricingMode !== 'MANUAL') {
    throw new SalesValidationError('Unsupported Draft pricing mode.')
  }

  let draftSource: SalesDraftLineInput['shortageResolution'] = null
  if (body.shortageResolution !== null && body.shortageResolution !== undefined) {
    const source = shortageResolution(body.shortageResolution)
    if (source?.type === 'OWN_STOCK') {
      throw new SalesValidationError(
        'OWN_STOCK is not persisted as a Draft shortage resolution.',
      )
    }
    draftSource = source ?? null
  }

  const serialIds = body.serialIds
  if (
    !Array.isArray(serialIds) ||
    serialIds.some((id) => typeof id !== 'string')
  ) {
    throw new SalesValidationError('serialIds must be a string array.')
  }

  let batchSelection: SalesDraftLineInput['batchSelection'] = null
  if (body.batchSelection !== null && body.batchSelection !== undefined) {
    const batch = objectBody(body.batchSelection)
    batchSelection = {
      lotId: stringField(batch, 'lotId'),
      batchCode: stringField(batch, 'batchCode'),
      expiresOn: stringField(batch, 'expiresOn'),
    }
  }

  return {
    variantId: stringField(body, 'variantId'),
    quantityInput: draftQuantityInput(body.quantityInput),
    normalizedQuantitySnapshot: {
      baseQty: stringField(normalized, 'baseQty'),
      pricingQty: stringField(normalized, 'pricingQty'),
      displayQty: stringField(normalized, 'displayQty'),
      components: stringRecord(normalized.components, 'components'),
      snapshot: normalized.snapshot ?? null,
    },
    pricingMode,
    manualUnitSellingPricePaisa: nullableString(
      body.manualUnitSellingPricePaisa,
      'manualUnitSellingPricePaisa',
    ),
    shortageResolution: draftSource,
    serialIds: serialIds as string[],
    batchSelection,
    warrantySnapshot: body.warrantySnapshot ?? null,
    captureValues: stringRecord(
      body.captureValues,
      'captureValues',
    ),
  }
}

function draftInput(value: unknown): SalesDraftInput {
  const body = objectBody(value)
  const customer = objectBody(body.customer)
  const payments = body.payments
  const lines = body.lines

  if (!Array.isArray(payments)) {
    throw new SalesValidationError('payments must be an array.')
  }
  if (!Array.isArray(lines)) {
    throw new SalesValidationError('lines must be an array.')
  }

  return {
    customer: {
      selectedCustomerId: nullableString(
        customer.selectedCustomerId,
        'selectedCustomerId',
      ),
      name: stringField(customer, 'name'),
      phone: stringField(customer, 'phone'),
      guardianName: stringField(customer, 'guardianName'),
      address: stringField(customer, 'address'),
    },
    discountPaisa: stringField(body, 'discountPaisa'),
    payments: payments.map(draftPayment),
    note: stringField(body, 'note'),
    lines: lines.map(draftLine),
  }
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

function shortageResolution(
  value: unknown,
): ShortageResolution | undefined {
  if (value === undefined) {
    return undefined
  }

  const body = objectBody(value)
  const type = stringField(body, 'type')
  const keys = Object.keys(body).sort()

  if (type === 'OWN_STOCK' || type === 'NEGATIVE_STOCK') {
    if (keys.length !== 1 || keys[0] !== 'type') {
      throw new SalesValidationError(
        'One shortage must use one resolution.',
      )
    }
    return { type }
  }

  if (type === 'VENDOR') {
    if (
      keys.length !== 3 ||
      !keys.includes('type') ||
      !keys.includes('vendorId') ||
      !keys.includes('unitCostPaisa')
    ) {
      throw new SalesValidationError(
        'Vendor shortage resolution requires Vendor and unit cost only.',
      )
    }
    return {
      type: 'VENDOR',
      vendorId: stringField(body, 'vendorId'),
      unitCostPaisa: stringField(body, 'unitCostPaisa'),
    }
  }

  throw new SalesValidationError('Unsupported shortage resolution.')
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
        ...(line.shortageResolution === undefined
          ? {}
          : {
              shortageResolution: shortageResolution(
                line.shortageResolution,
              ),
            }),
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
  .post('/sales/drafts', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const input = draftInput(await c.req.json())
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new SalesDraftService(
            c.get('tenantId'),
            database,
          ).create(c.get('userId'), input),
          201,
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
  .get('/sales/drafts', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const rawLimit = c.req.query('limit') ?? '5'
    const limit = Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      return c.json(
        { error: 'Recent Draft limit must be between 1 and 20' },
        400,
      )
    }

    return await withRequestDatabase(c.env, async (database) =>
      c.json(
        await new SalesDraftService(
          c.get('tenantId'),
          database,
        ).listRecent(
          c.get('userId'),
          limit,
          c.get('permissions').includes('SALES_EDIT'),
        ),
      ),
    )
  })
  .get('/sales/drafts/:draftId', async (c) => {
    if (!c.get('permissions').includes('POS_VIEW')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new SalesDraftService(
            c.get('tenantId'),
            database,
          ).get(
            c.req.param('draftId'),
            c.get('userId'),
            c.get('permissions').includes('SALES_EDIT'),
          ),
        ),
      )
    } catch (error) {
      if (error instanceof SalesDraftAccessError) {
        return c.json({ error: error.message }, 403)
      }
      if (error instanceof Error) {
        return c.json({ error: error.message }, 404)
      }
      throw error
    }
  })
  .patch('/sales/drafts/:draftId', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())
      const expectedVersion = positiveIntegerField(
        body,
        'expectedVersion',
      )
      const { expectedVersion: _expectedVersion, ...state } = body
      void _expectedVersion
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new SalesDraftService(
            c.get('tenantId'),
            database,
          ).update(
            c.get('userId'),
            c.req.param('draftId'),
            expectedVersion,
            draftInput(state),
            c.get('permissions').includes('SALES_EDIT'),
          ),
        ),
      )
    } catch (error) {
      if (error instanceof SalesDraftAccessError) {
        return c.json({ error: error.message }, 403)
      }
      if (error instanceof SalesDraftVersionConflictError) {
        return c.json(
          {
            error: error.message,
            currentVersion: error.currentVersion,
          },
          409,
        )
      }
      if (
        error instanceof SalesValidationError ||
        error instanceof Error
      ) {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })
  .post('/sales/drafts/:draftId/archive', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())
      const expectedVersion = positiveIntegerField(
        body,
        'expectedVersion',
      )
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new SalesDraftService(
            c.get('tenantId'),
            database,
          ).archive(
            c.get('userId'),
            c.req.param('draftId'),
            expectedVersion,
            c.get('permissions').includes('SALES_EDIT'),
          ),
        ),
      )
    } catch (error) {
      if (error instanceof SalesDraftAccessError) {
        return c.json({ error: error.message }, 403)
      }
      if (error instanceof SalesDraftVersionConflictError) {
        return c.json(
          {
            error: error.message,
            currentVersion: error.currentVersion,
          },
          409,
        )
      }
      if (
        error instanceof SalesValidationError ||
        error instanceof Error
      ) {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })
  .post('/sales/drafts/:draftId/post', async (c) => {
    if (!c.get('permissions').includes('POS_SELL')) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    try {
      const body = objectBody(await c.req.json())
      const expectedVersion = positiveIntegerField(
        body,
        'expectedVersion',
      )
      const canOverride = c
        .get('permissions')
        .includes('SALES_OVERRIDE_SELLING_PRICE')
      return await withRequestDatabase(c.env, async (database) =>
        c.json(
          await new SalesDraftService(
            c.get('tenantId'),
            database,
          ).post(
            c.get('userId'),
            c.req.param('draftId'),
            expectedVersion,
            {
              operationId: stringField(body, 'operationId'),
              businessDate: stringField(body, 'businessDate'),
              canOverrideSellingPrice: canOverride,
            },
            c.get('permissions').includes('SALES_EDIT'),
          ),
          201,
        ),
      )
    } catch (error) {
      if (error instanceof SalesDraftAccessError) {
        return c.json({ error: error.message }, 403)
      }
      if (error instanceof SalesDraftVersionConflictError) {
        return c.json(
          {
            error: error.message,
            currentVersion: error.currentVersion,
          },
          409,
        )
      }
      if (error instanceof SalesPermissionError) {
        return c.json({ error: error.message }, 403)
      }
      if (error instanceof SalesConflictError) {
        return c.json({ error: error.message }, 409)
      }
      if (
        error instanceof SalesValidationError ||
        error instanceof Error
      ) {
        return c.json({ error: error.message }, 400)
      }
      throw error
    }
  })
