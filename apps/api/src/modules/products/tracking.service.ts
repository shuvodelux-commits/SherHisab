import Decimal from 'decimal.js'
import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import {
  ProductNotFoundError,
  ProductValidationError,
} from './product.errors'
import { TrackingRepository } from './tracking.repository'
import type {
  InventorySerialRecord,
  SellableBatchRecord,
  WarrantyPolicyInput,
  WarrantyPolicyRecord,
  WarrantySnapshotRecord,
} from './tracking.types'

function positiveWholeUnits(value: string): number {
  let quantity: Decimal

  try {
    quantity = new Decimal(value)
  } catch {
    throw new ProductValidationError(
      'Serial sale quantity must be a whole positive number',
    )
  }

  if (!quantity.isFinite() || quantity.lte(0) || !quantity.isInteger()) {
    throw new ProductValidationError(
      'Serial sale quantity must be a whole positive number',
    )
  }

  if (quantity.gt(Number.MAX_SAFE_INTEGER)) {
    throw new ProductValidationError('Serial sale quantity is too large')
  }

  return quantity.toNumber()
}

function validDate(value: string, label: string): string {
  const normalized = value.trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ProductValidationError(
      `${label} must use YYYY-MM-DD`,
    )
  }

  const parsed = new Date(`${normalized}T00:00:00Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new ProductValidationError(`${label} is invalid`)
  }

  return normalized
}

export class TrackingService {
  private readonly repository: TrackingRepository

  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId) {
      throw new ProductValidationError('Trusted tenant id is required')
    }

    this.repository = new TrackingRepository(database)
  }

  listSellableSerials(
    variantId: string,
  ): Promise<InventorySerialRecord[]> {
    if (!variantId.trim()) {
      throw new ProductValidationError('Variant is required')
    }

    return this.repository.listSellableSerials(
      this.tenantId,
      variantId.trim(),
    )
  }

  listSellableBatches(
    variantId: string,
    businessDate: string,
  ): Promise<SellableBatchRecord[]> {
    const normalizedVariantId = variantId.trim()
    if (!normalizedVariantId) {
      throw new ProductValidationError('Variant is required')
    }

    return this.repository.listSellableBatches(
      this.tenantId,
      normalizedVariantId,
      validDate(businessDate, 'Business date'),
    )
  }

  async validateAndLockSerials(input: {
    variantId: string
    baseQty: string
    serialIds: string[]
  }): Promise<InventorySerialRecord[]> {
    const variantId = input.variantId.trim()
    if (!variantId) {
      throw new ProductValidationError('Variant is required')
    }

    const required = positiveWholeUnits(input.baseQty)
    if (input.serialIds.length !== required) {
      throw new ProductValidationError(
        `Serial sale requires exactly ${required} serials`,
      )
    }

    const normalizedIds = input.serialIds.map((id) => id.trim())
    if (normalizedIds.some((id) => !id)) {
      throw new ProductValidationError('Serial selection is invalid')
    }

    if (new Set(normalizedIds).size !== normalizedIds.length) {
      throw new ProductValidationError(
        'Serial selections must be unique',
      )
    }

    const locked = await this.repository.lockSellableSerialsByIds(
      this.tenantId,
      variantId,
      normalizedIds,
    )
    const byId = new Map(locked.map((serial) => [serial.id, serial]))

    if (locked.length !== required) {
      throw new ProductValidationError(
        'Serial is unavailable for this Variant',
      )
    }

    return normalizedIds.map((id) => {
      const serial = byId.get(id)
      if (!serial) {
        throw new ProductValidationError(
          'Serial is unavailable for this Variant',
        )
      }
      return serial
    })
  }

  async replaceWarrantyPolicy(
    productId: string,
    input: WarrantyPolicyInput,
  ): Promise<WarrantyPolicyRecord> {
    const normalizedProductId = productId.trim()
    if (!normalizedProductId) {
      throw new ProductValidationError('Product is required')
    }

    const exists = await this.repository.productExists(
      this.tenantId,
      normalizedProductId,
    )
    if (!exists) {
      throw new ProductNotFoundError('Product not found.')
    }

    if (!input.enabled) {
      return this.repository.upsertWarrantyPolicy({
        tenantId: this.tenantId,
        productId: normalizedProductId,
        enabled: false,
        durationValue: null,
        durationUnit: null,
        provider: input.provider?.trim() ?? '',
        text: input.text?.trim() ?? '',
      })
    }

    const durationValue = input.durationValue
    if (
      durationValue === undefined ||
      durationValue === null ||
      !Number.isInteger(durationValue) ||
      durationValue <= 0
    ) {
      throw new ProductValidationError(
        'Warranty duration must be a positive whole number',
      )
    }

    const durationUnit = input.durationUnit
    if (
      durationUnit !== 'DAY' &&
      durationUnit !== 'MONTH' &&
      durationUnit !== 'YEAR'
    ) {
      throw new ProductValidationError(
        'Warranty duration unit is invalid',
      )
    }

    return this.repository.upsertWarrantyPolicy({
      tenantId: this.tenantId,
      productId: normalizedProductId,
      enabled: true,
      durationValue,
      durationUnit,
      provider: input.provider?.trim() ?? '',
      text: input.text?.trim() ?? '',
    })
  }

  async createWarrantySnapshot(input: {
    productId: string
    salesLineId: string
    serialId: string | null
    startsOn: string
  }): Promise<WarrantySnapshotRecord> {
    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const repository = new TrackingRepository(database)
        const policy = await repository.findWarrantyPolicy(
          this.tenantId,
          input.productId,
        )

        if (
          !policy ||
          !policy.enabled ||
          policy.durationValue === null ||
          policy.durationUnit === null
        ) {
          throw new ProductValidationError(
            'Warranty is not enabled for this Product',
          )
        }

        if (
          !(await repository.salesLineBelongsToProduct(
            this.tenantId,
            input.salesLineId,
            input.productId,
          ))
        ) {
          throw new ProductValidationError(
            'Sales line does not belong to this Product',
          )
        }

        if (
          input.serialId &&
          !(await repository.serialBelongsToSalesLineVariant({
            tenantId: this.tenantId,
            salesLineId: input.salesLineId,
            serialId: input.serialId,
          }))
        ) {
          throw new ProductValidationError(
            'Warranty serial does not belong to the sales line Variant',
          )
        }

        return repository.createWarrantySnapshot({
          tenantId: this.tenantId,
          salesLineId: input.salesLineId,
          serialId: input.serialId,
          sourcePolicyId: policy.id,
          durationValue: policy.durationValue,
          durationUnit: policy.durationUnit,
          provider: policy.provider,
          text: policy.text,
          startsOn: validDate(input.startsOn, 'Warranty start date'),
        })
      },
    )
  }

  listWarrantySnapshots(
    salesLineId: string,
  ): Promise<WarrantySnapshotRecord[]> {
    if (!salesLineId.trim()) {
      throw new ProductValidationError('Sales line is required')
    }

    return this.repository.listWarrantySnapshots(
      this.tenantId,
      salesLineId.trim(),
    )
  }
}
