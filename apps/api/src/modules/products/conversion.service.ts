import Decimal from 'decimal.js'
import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import {
  ProductNotFoundError,
  ProductValidationError,
} from './product.errors'
import { ConversionRepository } from './conversion.repository'
import type {
  ConversionComponentInput,
  ConversionProfileInput,
  ConversionProfileSnapshot,
  ConversionProfileType,
  NormalizedQuantity,
  QuantityInput,
} from './conversion.types'

const PROFILE_TYPES = new Set<ConversionProfileType>([
  'SIMPLE',
  'PACK',
  'LENGTH',
  'COMPOUND',
  'CUSTOM_FIXED_RATIO',
])

function requireText(value: string, label: string): string {
  const normalized = value.trim()

  if (!normalized) {
    throw new ProductValidationError(`${label} is required`)
  }

  return normalized
}

function positiveInteger(value: string, label: string): string {
  const normalized = value.trim()

  if (!/^\d+$/.test(normalized) || BigInt(normalized) <= 0n) {
    throw new ProductValidationError(
      `${label} must be a positive integer`,
    )
  }

  return BigInt(normalized).toString()
}

function finiteDecimal(value: string, label: string): string {
  let decimal: Decimal

  try {
    decimal = new Decimal(value)
  } catch {
    throw new ProductValidationError(
      `${label} must be a valid number`,
    )
  }

  if (!decimal.isFinite()) {
    throw new ProductValidationError(
      `${label} must be a valid number`,
    )
  }

  return decimal.toFixed()
}

function normalizeComponent(
  component: ConversionComponentInput,
): ConversionComponentInput {
  const minValue = finiteDecimal(
    component.minValue,
    `${component.label || 'Component'} minimum`,
  )
  const maxExclusive =
    component.maxExclusive === undefined ||
    component.maxExclusive === null
      ? null
      : finiteDecimal(
          component.maxExclusive,
          `${component.label || 'Component'} maximum`,
        )

  if (
    maxExclusive !== null &&
    new Decimal(maxExclusive).lte(minValue)
  ) {
    throw new ProductValidationError(
      'Component maximum must be greater than minimum',
    )
  }

  if (!Number.isInteger(component.sortOrder) || component.sortOrder < 0) {
    throw new ProductValidationError(
      'Component sort order must be a non-negative integer',
    )
  }

  return {
    key: requireText(component.key, 'Component key'),
    label: requireText(component.label, 'Component label'),
    unitId: requireText(component.unitId, 'Component unit'),
    baseFactorNumerator: positiveInteger(
      component.baseFactorNumerator,
      'Component factor numerator',
    ),
    baseFactorDenominator: positiveInteger(
      component.baseFactorDenominator,
      'Component factor denominator',
    ),
    sortOrder: component.sortOrder,
    minValue,
    maxExclusive,
    allowFraction: Boolean(component.allowFraction),
    autoNormalizeRemainder: Boolean(
      component.autoNormalizeRemainder,
    ),
  }
}

function normalizeProfile(
  input: ConversionProfileInput,
): ConversionProfileInput {
  if (!PROFILE_TYPES.has(input.type)) {
    throw new ProductValidationError(
      'Conversion profile type is invalid',
    )
  }

  if (
    !Number.isInteger(input.displayPrecision) ||
    input.displayPrecision < 0 ||
    input.displayPrecision > 8
  ) {
    throw new ProductValidationError(
      'Display precision must be between 0 and 8',
    )
  }

  const components = input.components
    .map(normalizeComponent)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const keys = new Set<string>()
  const sortOrders = new Set<number>()

  for (const component of components) {
    const key = component.key.toLocaleLowerCase('en-US')

    if (keys.has(key)) {
      throw new ProductValidationError(
        'Conversion component keys must be unique',
      )
    }
    if (sortOrders.has(component.sortOrder)) {
      throw new ProductValidationError(
        'Conversion component sort order must be unique',
      )
    }

    keys.add(key)
    sortOrders.add(component.sortOrder)
  }

  if (input.type !== 'SIMPLE' && components.length === 0) {
    throw new ProductValidationError(
      'Conversion profile requires at least one component',
    )
  }

  return {
    type: input.type,
    baseUnitId: requireText(input.baseUnitId, 'Base unit'),
    pricingUnitId: requireText(input.pricingUnitId, 'Pricing unit'),
    pricingBaseFactorNumerator: positiveInteger(
      input.pricingBaseFactorNumerator,
      'Pricing factor numerator',
    ),
    pricingBaseFactorDenominator: positiveInteger(
      input.pricingBaseFactorDenominator,
      'Pricing factor denominator',
    ),
    displayPrecision: input.displayPrecision,
    components,
  }
}

function decimalQuantity(
  value: string,
  label: string,
): Decimal {
  let quantity: Decimal

  try {
    quantity = new Decimal(value)
  } catch {
    throw new ProductValidationError(
      `${label} must be a valid quantity`,
    )
  }

  if (!quantity.isFinite()) {
    throw new ProductValidationError(
      `${label} must be a valid quantity`,
    )
  }

  if (quantity.isNegative()) {
    throw new ProductValidationError(
      `${label} cannot be negative`,
    )
  }

  return quantity
}

function decimalString(value: Decimal): string {
  return value.toFixed()
}

function componentFactor(
  component: ConversionProfileSnapshot['components'][number],
): Decimal {
  return new Decimal(component.baseFactorNumerator).div(
    component.baseFactorDenominator,
  )
}

function displayQuantity(
  value: Decimal,
  precision: number,
): string {
  return value
    .toDecimalPlaces(precision, Decimal.ROUND_HALF_UP)
    .toFixed()
}

export class ConversionService {
  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId) {
      throw new ProductValidationError(
        'Trusted tenant id is required',
      )
    }
  }

  async replaceActiveProfile(
    productId: string,
    rawInput: ConversionProfileInput,
  ): Promise<ConversionProfileSnapshot> {
    return withDatabaseTransaction(
      this.database,
      async (database) =>
        new ConversionService(
          this.tenantId,
          database,
        ).replaceActiveProfileInTransaction(
          productId,
          rawInput,
        ),
    )
  }

  async replaceActiveProfileInTransaction(
    productId: string,
    rawInput: ConversionProfileInput,
  ): Promise<ConversionProfileSnapshot> {
    const input = normalizeProfile(rawInput)
    const repository = new ConversionRepository(this.database)
    const product = await repository.lockProduct(
      this.tenantId,
      productId,
    )

    if (!product) {
      throw new ProductNotFoundError('Product not found.')
    }

    if (product.baseUnitId !== input.baseUnitId) {
      throw new ProductValidationError(
        'Conversion base unit must match Product base unit',
      )
    }

    const unitIds = new Set([
      input.baseUnitId,
      input.pricingUnitId,
      ...input.components.map((component) => component.unitId),
    ])

    for (const unitId of unitIds) {
      if (
        !(await repository.unitIsActive(
          this.tenantId,
          unitId,
        ))
      ) {
        throw new ProductValidationError(
          'Conversion units must be active for this tenant',
        )
      }
    }

    const version = await repository.nextVersion(
      this.tenantId,
      productId,
    )
    await repository.deactivateActiveProfile(
      this.tenantId,
      productId,
    )
    const profile = await repository.insertProfile({
      tenantId: this.tenantId,
      productId,
      version,
      profile: input,
    })

    for (const component of input.components) {
      await repository.insertComponent({
        tenantId: this.tenantId,
        profileId: profile.id,
        component,
      })
    }

    const snapshot = await repository.findProfileVersion(
      this.tenantId,
      productId,
      version,
    )

    if (!snapshot) {
      throw new Error('Created conversion profile disappeared')
    }

    return snapshot
  }

  async clearActiveProfile(
    productId: string,
  ): Promise<void> {
    await withDatabaseTransaction(
      this.database,
      async (database) =>
        new ConversionService(
          this.tenantId,
          database,
        ).clearActiveProfileInTransaction(productId),
    )
  }

  async clearActiveProfileInTransaction(
    productId: string,
  ): Promise<void> {
    const repository = new ConversionRepository(this.database)
    const product = await repository.lockProduct(
      this.tenantId,
      productId,
    )

    if (!product) {
      throw new ProductNotFoundError('Product not found.')
    }

    await repository.deactivateActiveProfile(
      this.tenantId,
      productId,
    )
  }

  async normalize(
    input: QuantityInput,
    snapshotOverride?: ConversionProfileSnapshot,
  ): Promise<NormalizedQuantity> {
    if (input.kind === 'SIMPLE') {
      const baseQty = decimalQuantity(
        input.baseQty,
        'Normalized quantity',
      )

      if (baseQty.lte(0)) {
        throw new ProductValidationError(
          'Normalized quantity must be greater than zero',
        )
      }

      if (!snapshotOverride) {
        const value = decimalString(baseQty)

        return {
          baseQty: value,
          pricingQty: value,
          displayQty: value,
          components: {},
          snapshot: null,
        }
      }

      const pricingQty = baseQty
        .times(snapshotOverride.pricingBaseFactorDenominator)
        .div(snapshotOverride.pricingBaseFactorNumerator)

      return {
        baseQty: decimalString(baseQty),
        pricingQty: decimalString(pricingQty),
        displayQty: displayQuantity(
          pricingQty,
          snapshotOverride.displayPrecision,
        ),
        components: {},
        snapshot: snapshotOverride,
      }
    }

    const snapshot =
      snapshotOverride ??
      (await new ConversionRepository(
        this.database,
      ).findProfileByIdVersion(
        this.tenantId,
        input.profileId,
        input.profileVersion,
      ))

    if (
      !snapshot ||
      snapshot.id !== input.profileId ||
      snapshot.version !== input.profileVersion
    ) {
      throw new ProductValidationError(
        'Conversion profile version was not found',
      )
    }

    const configuredKeys = new Set(
      snapshot.components.map((component) => component.key),
    )
    for (const key of Object.keys(input.components)) {
      if (!configuredKeys.has(key)) {
        throw new ProductValidationError(
          `Unknown conversion component: ${key}`,
        )
      }
    }

    const values = new Map<string, Decimal>()

    for (const component of snapshot.components) {
      const value = decimalQuantity(
        input.components[component.key] ?? '0',
        component.label,
      )

      if (!component.allowFraction && !value.isInteger()) {
        throw new ProductValidationError(
          `${component.label} must be a whole number`,
        )
      }

      if (value.lt(component.minValue)) {
        throw new ProductValidationError(
          `${component.label} must be at least ${component.minValue}`,
        )
      }

      values.set(component.key, value)
    }

    const descending = [...snapshot.components].sort(
      (a, b) => b.sortOrder - a.sortOrder,
    )

    for (const component of descending) {
      const maximum = component.maxExclusive
      const value = values.get(component.key)

      if (!value) {
        throw new Error('Conversion component value disappeared')
      }

      if (maximum === null || value.lt(maximum)) {
        continue
      }

      if (!component.autoNormalizeRemainder) {
        throw new ProductValidationError(
          `${component.label} must be less than ${maximum}`,
        )
      }

      const max = new Decimal(maximum)
      const requiredParentFactor = componentFactor(component).times(
        max,
      )
      const parent = snapshot.components
        .filter(
          (candidate) =>
            candidate.sortOrder < component.sortOrder,
        )
        .sort((a, b) => b.sortOrder - a.sortOrder)
        .find((candidate) =>
          componentFactor(candidate).eq(requiredParentFactor),
        )

      if (!parent) {
        throw new ProductValidationError(
          `${component.label} cannot be normalized because its parent ratio is not configured`,
        )
      }

      const carry = value.dividedToIntegerBy(max)
      const remainder = value.modulo(max)
      const parentValue = values.get(parent.key)

      if (!parentValue) {
        throw new Error('Conversion parent value disappeared')
      }

      values.set(component.key, remainder)
      values.set(parent.key, parentValue.plus(carry))
    }

    let baseQty = new Decimal(0)
    const normalizedComponents: Record<string, string> = {}

    for (const component of snapshot.components) {
      const value = values.get(component.key)

      if (!value) {
        throw new Error('Conversion component value disappeared')
      }

      if (value.lt(component.minValue)) {
        throw new ProductValidationError(
          `${component.label} must be at least ${component.minValue}`,
        )
      }

      if (
        component.maxExclusive !== null &&
        value.gte(component.maxExclusive)
      ) {
        throw new ProductValidationError(
          `${component.label} must be less than ${component.maxExclusive}`,
        )
      }

      normalizedComponents[component.key] =
        decimalString(value)
      baseQty = baseQty.plus(
        value.times(component.baseFactorNumerator).div(
          component.baseFactorDenominator,
        ),
      )
    }

    if (baseQty.lte(0)) {
      throw new ProductValidationError(
        'Normalized quantity must be greater than zero',
      )
    }

    const pricingQty = baseQty
      .times(snapshot.pricingBaseFactorDenominator)
      .div(snapshot.pricingBaseFactorNumerator)

    return {
      baseQty: decimalString(baseQty),
      pricingQty: decimalString(pricingQty),
      displayQty: displayQuantity(
        pricingQty,
        snapshot.displayPrecision,
      ),
      components: normalizedComponents,
      snapshot,
    }
  }

  async getActiveProfile(
    productId: string,
  ): Promise<ConversionProfileSnapshot | null> {
    return new ConversionRepository(
      this.database,
    ).findActiveProfile(this.tenantId, productId)
  }

  async getProfileVersion(
    productId: string,
    version: number,
  ): Promise<ConversionProfileSnapshot | null> {
    if (!Number.isInteger(version) || version <= 0) {
      throw new ProductValidationError(
        'Conversion profile version must be a positive integer',
      )
    }

    return new ConversionRepository(
      this.database,
    ).findProfileVersion(this.tenantId, productId, version)
  }
}
