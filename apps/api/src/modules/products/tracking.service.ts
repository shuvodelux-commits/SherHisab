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
  CaptureValueSnapshotRecord,
  InventorySerialRecord,
  ProductCaptureFieldDefinition,
  ProductCaptureFieldDefinitionInput,
  ProductCaptureFieldType,
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

const CAPTURE_FIELD_TYPES = new Set<ProductCaptureFieldType>([
  'text',
  'number',
  'date',
  'select',
])

function requiredCaptureText(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new ProductValidationError(`${label} is required`)
  }
  return normalized
}

function normalizeCaptureDefinitions(
  definitions: ProductCaptureFieldDefinitionInput[],
): Array<Omit<ProductCaptureFieldDefinition, 'id'>> {
  const keys = new Set<string>()

  return definitions.map((definition, sortOrder) => {
    const key = requiredCaptureText(
      definition.key,
      'Capture field key',
    )
    if (!/^[A-Za-z0-9_-]+$/.test(key)) {
      throw new ProductValidationError(
        'Capture field key can only use letters, numbers, underscore, and hyphen',
      )
    }

    const comparableKey = key.toLocaleLowerCase('en-US')
    if (keys.has(comparableKey)) {
      throw new ProductValidationError(
        'Capture field keys must be unique',
      )
    }
    keys.add(comparableKey)

    if (!CAPTURE_FIELD_TYPES.has(definition.type)) {
      throw new ProductValidationError(
        'Capture field type is invalid',
      )
    }

    const options = (definition.selectOptions ?? [])
      .map((option) => option.trim())
      .filter(Boolean)
    const optionKeys = new Set<string>()
    for (const option of options) {
      const comparable = option.toLocaleLowerCase('en-US')
      if (optionKeys.has(comparable)) {
        throw new ProductValidationError(
          'Capture field select options must be unique',
        )
      }
      optionKeys.add(comparable)
    }

    if (definition.type === 'select' && options.length === 0) {
      throw new ProductValidationError(
        'Select capture fields require at least one option',
      )
    }
    if (definition.type !== 'select' && options.length > 0) {
      throw new ProductValidationError(
        'Only select capture fields can define select options',
      )
    }

    return {
      key,
      label: requiredCaptureText(
        definition.label,
        'Capture field label',
      ),
      type: definition.type,
      selectOptions: options,
      required: Boolean(definition.required),
      sortOrder,
    }
  })
}

function normalizeCaptureValue(
  definition: ProductCaptureFieldDefinition,
  rawValue: string,
): string {
  const value = rawValue.trim()

  if (definition.type === 'number') {
    let number: Decimal
    try {
      number = new Decimal(value)
    } catch {
      throw new ProductValidationError(
        `${definition.label} must be a valid number`,
      )
    }
    if (!number.isFinite()) {
      throw new ProductValidationError(
        `${definition.label} must be a valid number`,
      )
    }
    return number.toFixed()
  }

  if (definition.type === 'date') {
    return validDate(value, definition.label)
  }

  if (
    definition.type === 'select' &&
    !definition.selectOptions.includes(value)
  ) {
    throw new ProductValidationError(
      `${definition.label} must use a configured option`,
    )
  }

  return value
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

  async replaceCaptureFields(
    productId: string,
    definitions: ProductCaptureFieldDefinitionInput[],
  ): Promise<ProductCaptureFieldDefinition[]> {
    return withDatabaseTransaction(
      this.database,
      async (database) =>
        new TrackingService(
          this.tenantId,
          database,
        ).replaceCaptureFieldsInTransaction(productId, definitions),
    )
  }

  async replaceCaptureFieldsInTransaction(
    productId: string,
    definitions: ProductCaptureFieldDefinitionInput[],
  ): Promise<ProductCaptureFieldDefinition[]> {
    const normalizedProductId = productId.trim()
    if (!normalizedProductId) {
      throw new ProductValidationError('Product is required')
    }
    const normalized = normalizeCaptureDefinitions(definitions)

    if (
      !(await this.repository.lockProduct(
        this.tenantId,
        normalizedProductId,
      ))
    ) {
      throw new ProductNotFoundError('Product not found.')
    }

    await this.repository.deactivateCaptureFields(
      this.tenantId,
      normalizedProductId,
    )

    const created: ProductCaptureFieldDefinition[] = []
    for (const definition of normalized) {
      created.push(
        await this.repository.insertCaptureField({
          tenantId: this.tenantId,
          productId: normalizedProductId,
          ...definition,
        }),
      )
    }

    return created
  }

  listCaptureFields(
    productId: string,
  ): Promise<ProductCaptureFieldDefinition[]> {
    const normalizedProductId = productId.trim()
    if (!normalizedProductId) {
      throw new ProductValidationError('Product is required')
    }

    return this.repository.listCaptureFields(
      this.tenantId,
      normalizedProductId,
    )
  }

  async snapshotCaptureValues(input: {
    productId: string
    salesLineId: string
    values: Record<string, string>
  }): Promise<CaptureValueSnapshotRecord[]> {
    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const repository = new TrackingRepository(database)

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

        const definitions = await repository.listCaptureFields(
          this.tenantId,
          input.productId,
        )
        const byKey = new Map(
          definitions.map((definition) => [
            definition.key,
            definition,
          ]),
        )

        for (const key of Object.keys(input.values)) {
          if (!byKey.has(key)) {
            throw new ProductValidationError(
              `Unknown capture field: ${key}`,
            )
          }
        }

        const created: CaptureValueSnapshotRecord[] = []
        for (const definition of definitions) {
          const rawValue = input.values[definition.key]
          const hasValue =
            rawValue !== undefined && rawValue.trim() !== ''

          if (!hasValue) {
            if (definition.required) {
              throw new ProductValidationError(
                `${definition.label} is required`,
              )
            }
            continue
          }

          created.push(
            await repository.insertCaptureValueSnapshot({
              tenantId: this.tenantId,
              salesLineId: input.salesLineId,
              definition,
              value: normalizeCaptureValue(
                definition,
                rawValue,
              ),
            }),
          )
        }

        return created
      },
    )
  }

  listCaptureValueSnapshots(
    salesLineId: string,
  ): Promise<CaptureValueSnapshotRecord[]> {
    const normalizedSalesLineId = salesLineId.trim()
    if (!normalizedSalesLineId) {
      throw new ProductValidationError('Sales line is required')
    }

    return this.repository.listCaptureValueSnapshots(
      this.tenantId,
      normalizedSalesLineId,
    )
  }

  async replaceWarrantyPolicy(
    productId: string,
    input: WarrantyPolicyInput,
  ): Promise<WarrantyPolicyRecord> {
    return withDatabaseTransaction(
      this.database,
      async (database) =>
        new TrackingService(
          this.tenantId,
          database,
        ).replaceWarrantyPolicyInTransaction(productId, input),
    )
  }

  async replaceWarrantyPolicyInTransaction(
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

  async getWarrantyPolicy(
    productId: string,
  ): Promise<WarrantyPolicyRecord | null> {
    const normalizedProductId = productId.trim()
    if (!normalizedProductId) {
      throw new ProductValidationError('Product is required')
    }

    return this.repository.findWarrantyPolicy(
      this.tenantId,
      normalizedProductId,
    )
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
