import Decimal from 'decimal.js'
import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from './product.errors'
import { InventoryService } from './inventory.service'
import { ProductMasterRepository } from './product-master.repository'
import type {
  AdvancedProductConfigurationInput,
  AlternativeUnitInput,
  CategoryRecord,
  CreateProductInput,
  CreateUnitInput,
  ProductAdvancedConfiguration,
  ProductDetail,
  ProductListFilters,
  ProductListResult,
  ProductStockTarget,
  ReplaceVariantConfigurationInput,
  SpecificationInput,
  TrackingMode,
  UnitRecord,
  UpdateProductInput,
  VariantInput,
} from './product.types'
import {
  parseMoneyPaisa,
  parsePositiveConversion,
  parseQuantity,
  requireName,
} from './product.validation'

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23503'
  )
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  )
}

function requireTrackingMode(value: TrackingMode): TrackingMode {
  if (value !== 'SIMPLE' && value !== 'LOT' && value !== 'BATCH') {
    throw new ProductValidationError('Tracking mode is invalid')
  }

  return value
}

const PRODUCT_SORT_KEYS = new Set([
  'name',
  'category',
  'brand',
  'unit',
  'purchasePrice',
  'sellingPrice',
  'stock',
  'minimumStock',
  'stockValue',
  'status',
])

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(maximum, Math.max(minimum, Math.trunc(value)))
}


interface NormalizedOptionValue {
  value: string
  key: string
}

interface NormalizedVariantOption {
  name: string
  key: string
  values: NormalizedOptionValue[]
}

interface NormalizedVariantInput {
  id?: string
  displayName: string
  sku: string | null
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
  selections: Record<string, string>
  selectionKeys: Record<string, string>
  canonicalSelection: string
}

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function canonicalizeSelections(
  selections: Record<string, string>,
): string {
  return Object.entries(selections)
    .map(([name, value]) => [normalizedKey(name), normalizedKey(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join('|')
}

function normalizeVariantConfiguration(
  input: ReplaceVariantConfigurationInput,
): {
  enabled: boolean
  options: NormalizedVariantOption[]
  variants: NormalizedVariantInput[]
} {
  if (!input.enabled) {
    return { enabled: false, options: [], variants: [] }
  }

  const optionKeys = new Set<string>()
  const options = input.options.map((option) => {
    const name = requireName(option.name, 'Variant option name')
    const key = normalizedKey(name)

    if (optionKeys.has(key)) {
      throw new ProductValidationError(
        'Variant option names must be unique.',
      )
    }
    optionKeys.add(key)

    const valueKeys = new Set<string>()
    const values = option.values.map((rawValue) => {
      const value = requireName(rawValue, `${name} option value`)
      const valueKey = normalizedKey(value)

      if (valueKeys.has(valueKey)) {
        throw new ProductValidationError(
          `${name} option values must be unique.`,
        )
      }
      valueKeys.add(valueKey)

      return { value, key: valueKey }
    })

    if (values.length === 0) {
      throw new ProductValidationError(
        `${name} must contain at least one option value.`,
      )
    }

    return { name, key, values }
  })

  const variantIds = new Set<string>()
  const combinations = new Set<string>()

  const variants = input.variants.map((variant: VariantInput) => {
    if (variant.id) {
      if (variantIds.has(variant.id)) {
        throw new ProductValidationError('Variant ids must be unique.')
      }
      variantIds.add(variant.id)
    }

    const displayName = requireName(variant.displayName, 'Variant name')
    const sku = variant.sku?.trim() || null
    const purchasePrice = parseMoneyPaisa(
      variant.defaultPurchasePricePaisa,
      'Variant purchase price',
    )
    const sellingPrice = parseMoneyPaisa(
      variant.defaultSellingPricePaisa,
      'Variant selling price',
    )
    const minimumStock = parseQuantity(
      variant.minimumStockBaseQty,
      'Variant minimum stock',
    )

    const selectionKeys: Record<string, string> = {}
    for (const [rawName, rawValue] of Object.entries(variant.selections)) {
      const optionKey = normalizedKey(rawName)
      if (optionKey in selectionKeys) {
        throw new ProductValidationError(
          'Each Variant option can be selected only once.',
        )
      }
      selectionKeys[optionKey] = normalizedKey(rawValue)
    }

    if (Object.keys(selectionKeys).length !== options.length) {
      throw new ProductValidationError(
        'Each Variant must select exactly one value for every option.',
      )
    }

    const selections: Record<string, string> = {}
    for (const option of options) {
      const selectedKey = selectionKeys[option.key]
      if (!selectedKey) {
        throw new ProductValidationError(
          `Variant is missing a ${option.name} selection.`,
        )
      }

      const selectedValue = option.values.find(
        (value) => value.key === selectedKey,
      )
      if (!selectedValue) {
        throw new ProductValidationError(
          `Variant selection for ${option.name} is invalid.`,
        )
      }

      selections[option.name] = selectedValue.value
    }

    const canonicalSelection = canonicalizeSelections(selections)
    if (combinations.has(canonicalSelection)) {
      throw new ProductValidationError(
        'Variant option combinations must be unique.',
      )
    }
    combinations.add(canonicalSelection)

    return {
      id: variant.id,
      displayName,
      sku,
      defaultPurchasePricePaisa: purchasePrice,
      defaultSellingPricePaisa: sellingPrice,
      minimumStockBaseQty: minimumStock,
      selections,
      selectionKeys,
      canonicalSelection,
    }
  })

  return { enabled: true, options, variants }
}

export class ProductMasterService {
  private readonly repository: ProductMasterRepository

  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId) {
      throw new ProductValidationError('Trusted tenant id is required')
    }

    this.repository = new ProductMasterRepository(database)
  }

  async listCategories(includeInactive = false): Promise<CategoryRecord[]> {
    return this.repository.listCategories(this.tenantId, includeInactive)
  }

  async createCategory(name: string): Promise<CategoryRecord> {
    const normalizedName = requireName(name, 'Category name')

    try {
      return await withDatabaseTransaction(this.database, async (database) => {
        return new ProductMasterRepository(database).createCategory(
          this.tenantId,
          normalizedName,
        )
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError(
          'A category with this name already exists.',
        )
      }

      throw error
    }
  }

  async setCategoryActive(
    categoryId: string,
    active: boolean,
  ): Promise<CategoryRecord> {
    try {
      const category = await withDatabaseTransaction(
        this.database,
        async (database) => {
          return new ProductMasterRepository(database).setCategoryActive(
            this.tenantId,
            categoryId,
            active,
          )
        },
      )

      if (!category) {
        throw new ProductNotFoundError('Category not found.')
      }

      return category
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError(
          'A category with this name already exists.',
        )
      }

      throw error
    }
  }

  async updateCategory(
    categoryId: string,
    name: string,
  ): Promise<CategoryRecord> {
    const normalizedName = requireName(name, 'Category name')

    try {
      const category = await withDatabaseTransaction(
        this.database,
        async (database) => {
          return new ProductMasterRepository(database).updateCategory(
            this.tenantId,
            categoryId,
            normalizedName,
          )
        },
      )

      if (!category) {
        throw new ProductNotFoundError('Category not found.')
      }

      return category
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError(
          'A category with this name already exists.',
        )
      }

      throw error
    }
  }

  async deleteCategory(categoryId: string): Promise<void> {
    try {
      await withDatabaseTransaction(this.database, async (database) => {
        const repository = new ProductMasterRepository(database)
        const category = await repository.findCategoryById(
          this.tenantId,
          categoryId,
        )

        if (!category) {
          throw new ProductNotFoundError('Category not found.')
        }

        if (
          await repository.categoryIsReferenced(
            this.tenantId,
            categoryId,
          )
        ) {
          throw new ProductConflictError(
            'This category is used by products. Archive it instead.',
          )
        }

        if (
          !(await repository.deleteCategory(
            this.tenantId,
            categoryId,
          ))
        ) {
          throw new ProductNotFoundError('Category not found.')
        }
      })
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ProductConflictError(
          'This category is used by products. Archive it instead.',
        )
      }

      throw error
    }
  }

  async listUnits(includeInactive = false): Promise<UnitRecord[]> {
    return this.repository.listUnits(this.tenantId, includeInactive)
  }

  async createUnit(input: CreateUnitInput): Promise<UnitRecord> {
    const name = requireName(input.name, 'Unit name')
    const symbol = input.symbol?.trim() || null

    try {
      return await withDatabaseTransaction(this.database, async (database) => {
        return new ProductMasterRepository(database).createUnit(this.tenantId, {
          name,
          symbol,
        })
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError('A unit with this name already exists.')
      }

      throw error
    }
  }

  async setUnitActive(
    unitId: string,
    active: boolean,
  ): Promise<UnitRecord> {
    try {
      const unit = await withDatabaseTransaction(
        this.database,
        async (database) => {
          return new ProductMasterRepository(database).setUnitActive(
            this.tenantId,
            unitId,
            active,
          )
        },
      )

      if (!unit) {
        throw new ProductNotFoundError('Unit not found.')
      }

      return unit
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError('A unit with this name already exists.')
      }

      throw error
    }
  }

  async updateUnit(
    unitId: string,
    input: CreateUnitInput,
  ): Promise<UnitRecord> {
    const name = requireName(input.name, 'Unit name')
    const symbol = input.symbol?.trim() || null

    try {
      const unit = await withDatabaseTransaction(
        this.database,
        async (database) => {
          return new ProductMasterRepository(database).updateUnit(
            this.tenantId,
            unitId,
            { name, symbol },
          )
        },
      )

      if (!unit) {
        throw new ProductNotFoundError('Unit not found.')
      }

      return unit
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError('A unit with this name already exists.')
      }

      throw error
    }
  }

  async deleteUnit(unitId: string): Promise<void> {
    try {
      await withDatabaseTransaction(this.database, async (database) => {
        const repository = new ProductMasterRepository(database)
        const unit = await repository.findUnitById(this.tenantId, unitId)

        if (!unit) {
          throw new ProductNotFoundError('Unit not found.')
        }

        if (
          unit.name.trim().toLocaleLowerCase('en-US') === 'piece' &&
          unit.symbol?.trim().toLocaleLowerCase('en-US') === 'pcs'
        ) {
          throw new ProductConflictError(
            'The default Piece unit cannot be deleted.',
          )
        }

        if (await repository.unitIsReferenced(this.tenantId, unitId)) {
          throw new ProductConflictError(
            'This unit is used by products. Archive it instead.',
          )
        }

        if (!(await repository.deleteUnit(this.tenantId, unitId))) {
          throw new ProductNotFoundError('Unit not found.')
        }
      })
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ProductConflictError(
          'This unit is used by products. Archive it instead.',
        )
      }

      throw error
    }
  }

  async createProduct(
    input: CreateProductInput,
    actorUserId: string | null,
  ): Promise<ProductDetail> {
    const name = requireName(input.name, 'Product name')
    const brand = input.brand?.trim() ?? ''
    const categoryId = input.categoryId?.trim() || null
    const baseUnitId = requireName(input.baseUnitId, 'Base unit')
    const barcode = input.barcode?.trim() || null
    const purchasePrice = parseMoneyPaisa(
      input.defaultPurchasePricePaisa,
      'Purchase price',
    )
    const sellingPrice = parseMoneyPaisa(
      input.defaultSellingPricePaisa,
      'Selling price',
    )
    const openingStock = parseQuantity(
      input.openingStockBaseQty,
      'Opening stock',
    )
    const minimumStock = parseQuantity(
      input.minimumStockBaseQty,
      'Minimum stock',
    )
    const trackingMode = requireTrackingMode(input.trackingMode ?? 'SIMPLE')

    if (
      input.advanced?.variantConfiguration?.enabled &&
      new Decimal(openingStock).gt(0)
    ) {
      throw new ProductValidationError(
        'Opening stock must be zero when Variants are enabled; add stock per Variant after Product creation.',
      )
    }

    const baseUnit = await this.repository.findUnitById(
      this.tenantId,
      baseUnitId,
    )
    if (!baseUnit || !baseUnit.isActive) {
      throw new ProductValidationError('Base unit is not active for this tenant')
    }

    if (categoryId) {
      const category = await this.repository.findCategoryById(
        this.tenantId,
        categoryId,
      )
      if (!category || !category.isActive) {
        throw new ProductValidationError(
          'Category is not active for this tenant',
        )
      }
    }

    if (
      new Decimal(openingStock).gt(0) &&
      BigInt(purchasePrice) <= 0n
    ) {
      throw new ProductValidationError(
        'Purchase price must be greater than zero when opening stock is greater than zero',
      )
    }

    let productId: string

    try {
      productId = await withDatabaseTransaction(
        this.database,
        async (database) => {
          const repository = new ProductMasterRepository(database)
          const inventoryService = new InventoryService(database)
          const product = await repository.insertProduct(this.tenantId, {
            name,
            brand,
            categoryId,
            baseUnitId,
            trackingMode,
          })
          const variant = await repository.insertDefaultVariant(
            this.tenantId,
            product.id,
            {
              defaultPurchasePricePaisa: purchasePrice,
              defaultSellingPricePaisa: sellingPrice,
              minimumStockBaseQty: minimumStock,
            },
          )

          await repository.insertBaseProductUnit(
            this.tenantId,
            product.id,
            baseUnitId,
          )

          if (barcode) {
            await repository.insertPrimaryBarcode(
              this.tenantId,
              variant.id,
              baseUnitId,
              barcode,
            )
          }

          await inventoryService.createOpeningInventoryInTransaction({
            tenantId: this.tenantId,
            actorUserId,
            variantId: variant.id,
            baseQty: openingStock,
            unitCostPaisa: purchasePrice,
            defaultSellPricePaisa: sellingPrice,
          })

          if (input.advanced) {
            await this.applyAdvancedConfigurationInTransaction(
              database,
              product.id,
              input.advanced,
            )
          }

          return product.id
        },
      )
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError(
          'A Product with the same active name, SKU, or barcode already exists.',
        )
      }

      throw error
    }

    return this.getProduct(productId)
  }

  async getProduct(productId: string): Promise<ProductDetail> {
    const product = await this.repository.findProductDetail(
      this.tenantId,
      productId,
    )

    if (!product) {
      throw new ProductNotFoundError('Product not found.')
    }

    return product
  }

  async listProducts(
    filters: ProductListFilters = {},
  ): Promise<ProductListResult> {
    const status = filters.status ?? 'active'
    if (status !== 'active' && status !== 'inactive' && status !== 'all') {
      throw new ProductValidationError('Product status filter is invalid')
    }

    const sortBy = filters.sortBy ?? 'name'
    if (!PRODUCT_SORT_KEYS.has(sortBy)) {
      throw new ProductValidationError('Product sort column is invalid')
    }

    const sortDir = filters.sortDir ?? 'asc'
    if (sortDir !== 'asc' && sortDir !== 'desc') {
      throw new ProductValidationError('Product sort direction is invalid')
    }

    const limit = clampInteger(filters.limit, 50, 1, 100)
    const offset = clampInteger(filters.offset, 0, 0, Number.MAX_SAFE_INTEGER)
    const normalizedFilters: ProductListFilters = {
      ...filters,
      status,
      sortBy,
      sortDir,
      limit,
      offset,
    }

    const [items, total] = await Promise.all([
      this.repository.listProducts(this.tenantId, normalizedFilters),
      this.repository.countProducts(this.tenantId, normalizedFilters),
    ])

    return {
      items,
      total,
      limit,
      offset,
    }
  }

  async updateProduct(
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductDetail> {
    const current = await this.getProduct(productId)
    const name = requireName(input.name, 'Product name')
    const brand = input.brand?.trim() ?? ''
    const categoryId = input.categoryId?.trim() || null
    const baseUnitId = requireName(input.baseUnitId, 'Base unit')
    const barcode = input.barcode?.trim() || null
    const purchasePrice = parseMoneyPaisa(
      input.defaultPurchasePricePaisa,
      'Purchase price',
    )
    const sellingPrice = parseMoneyPaisa(
      input.defaultSellingPricePaisa,
      'Selling price',
    )
    const minimumStock = parseQuantity(
      input.minimumStockBaseQty,
      'Minimum stock',
    )
    const trackingMode = requireTrackingMode(input.trackingMode)

    if (categoryId && categoryId !== current.category?.id) {
      const category = await this.repository.findCategoryById(
        this.tenantId,
        categoryId,
      )
      if (!category || !category.isActive) {
        throw new ProductValidationError(
          'Category is not active for this tenant',
        )
      }
    }

    const baseUnitChanged = baseUnitId !== current.baseUnit.id
    if (baseUnitChanged) {
      const unit = await this.repository.findUnitById(
        this.tenantId,
        baseUnitId,
      )
      if (!unit || !unit.isActive) {
        throw new ProductValidationError(
          'Base unit is not active for this tenant',
        )
      }

    }

    try {
      await withDatabaseTransaction(this.database, async (database) => {
        const repository = new ProductMasterRepository(database)

        if (baseUnitChanged) {
          const lockedProduct = await repository.lockProductForAdvanced(
            this.tenantId,
            productId,
          )
          if (!lockedProduct) {
            throw new ProductNotFoundError('Product not found.')
          }

          const lockedVariant = await repository.lockDefaultVariant(
            this.tenantId,
            current.defaultVariantId,
          )
          if (!lockedVariant) {
            throw new ProductNotFoundError('Default Product variant not found.')
          }

          if (
            await repository.hasInventoryHistory(
              this.tenantId,
              current.defaultVariantId,
            )
          ) {
            throw new ProductValidationError(
              'Base unit cannot be changed after inventory history exists',
            )
          }
        }

        const updated = await repository.updateProductIdentity(
          this.tenantId,
          productId,
          {
            name,
            brand,
            categoryId,
            baseUnitId,
            trackingMode,
          },
        )

        if (!updated) {
          throw new ProductNotFoundError('Product not found.')
        }

        const variantUpdated = await repository.updateDefaultVariant(
          this.tenantId,
          current.defaultVariantId,
          {
            defaultPurchasePricePaisa: purchasePrice,
            defaultSellingPricePaisa: sellingPrice,
            minimumStockBaseQty: minimumStock,
          },
        )

        if (!variantUpdated) {
          throw new ProductNotFoundError('Default Product variant not found.')
        }

        if (baseUnitChanged) {
          await repository.replaceBaseProductUnit(
            this.tenantId,
            productId,
            baseUnitId,
          )
        }

        if (barcode !== current.primaryBarcode || baseUnitChanged) {
          await repository.replacePrimaryBarcode(
            this.tenantId,
            current.defaultVariantId,
            baseUnitId,
            barcode,
          )
        }

        if (input.advanced) {
          await this.applyAdvancedConfigurationInTransaction(
            database,
            productId,
            input.advanced,
          )
        }
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError(
          'A Product with the same active name, SKU, or barcode already exists.',
        )
      }

      throw error
    }

    return this.getProduct(productId)
  }

  async setProductActive(
    productId: string,
    active: boolean,
  ): Promise<ProductDetail> {
    try {
      const updated = await withDatabaseTransaction(
        this.database,
        async (database) => {
          return new ProductMasterRepository(database).setProductActive(
            this.tenantId,
            productId,
            active,
          )
        },
      )

      if (!updated) {
        throw new ProductNotFoundError('Product not found.')
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError(
          'A Product with this active name already exists.',
        )
      }

      throw error
    }

    return this.getProduct(productId)
  }

  async getAdvancedConfiguration(
    productId: string,
  ): Promise<ProductAdvancedConfiguration> {
    const product = await this.getProduct(productId)
    return this.repository.getAdvancedConfiguration(
      this.tenantId,
      productId,
      product.baseUnit.id,
    )
  }

  async listStockTargets(
    productId: string,
  ): Promise<ProductStockTarget[]> {
    await this.getProduct(productId)
    return this.repository.listStockTargets(this.tenantId, productId)
  }

  async replaceAlternativeUnits(
    productId: string,
    input: AlternativeUnitInput[],
  ): Promise<ProductAdvancedConfiguration> {
    try {
      await withDatabaseTransaction(this.database, async (database) => {
        await this.replaceAlternativeUnitsInTransaction(
          database,
          productId,
          input,
        )
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError(
          'An active Product unit mapping already exists.',
        )
      }
      throw error
    }

    return this.getAdvancedConfiguration(productId)
  }

  async replaceSpecifications(
    productId: string,
    input: SpecificationInput[],
  ): Promise<ProductAdvancedConfiguration> {
    await withDatabaseTransaction(this.database, async (database) => {
      await this.replaceSpecificationsInTransaction(database, productId, input)
    })

    return this.getAdvancedConfiguration(productId)
  }

  async replaceVariantConfiguration(
    productId: string,
    input: ReplaceVariantConfigurationInput,
  ): Promise<ProductAdvancedConfiguration> {
    try {
      await withDatabaseTransaction(this.database, async (database) => {
        await this.replaceVariantConfigurationInTransaction(
          database,
          productId,
          input,
        )
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductConflictError(
          'A Variant with the same active SKU already exists.',
        )
      }
      throw error
    }

    return this.getAdvancedConfiguration(productId)
  }

  private async applyAdvancedConfigurationInTransaction(
    database: DatabaseClient,
    productId: string,
    advanced: AdvancedProductConfigurationInput,
  ): Promise<void> {
    if (advanced.alternativeUnits !== undefined) {
      await this.replaceAlternativeUnitsInTransaction(
        database,
        productId,
        advanced.alternativeUnits,
      )
    }

    if (advanced.specifications !== undefined) {
      await this.replaceSpecificationsInTransaction(
        database,
        productId,
        advanced.specifications,
      )
    }

    if (advanced.variantConfiguration !== undefined) {
      await this.replaceVariantConfigurationInTransaction(
        database,
        productId,
        advanced.variantConfiguration,
      )
    }
  }

  private async requireLockedProductForAdvanced(
    repository: ProductMasterRepository,
    productId: string,
  ): Promise<{
    id: string
    baseUnitId: string
    variantsEnabled: boolean
  }> {
    const product = await repository.lockProductForAdvanced(
      this.tenantId,
      productId,
    )

    if (!product) {
      throw new ProductNotFoundError('Product not found.')
    }

    return product
  }

  private async replaceAlternativeUnitsInTransaction(
    database: DatabaseClient,
    productId: string,
    input: AlternativeUnitInput[],
  ): Promise<void> {
    const repository = new ProductMasterRepository(database)
    const product = await this.requireLockedProductForAdvanced(
      repository,
      productId,
    )
    const unitIds = new Set<string>()
    const normalized: Array<{
      unitId: string
      conversionMode: 'FIXED' | 'VARIABLE'
      conversionToBase: string | null
    }> = []

    for (const alternative of input) {
      const unitId = requireName(alternative.unitId, 'Alternative unit')

      if (unitId === product.baseUnitId) {
        throw new ProductValidationError(
          'Base unit cannot also be an alternative unit.',
        )
      }
      if (unitIds.has(unitId)) {
        throw new ProductValidationError(
          'Alternative units must be unique.',
        )
      }
      unitIds.add(unitId)

      const unit = await repository.findUnitById(this.tenantId, unitId)
      if (!unit || !unit.isActive) {
        throw new ProductValidationError(
          'Alternative unit is not active for this tenant.',
        )
      }

      if (
        alternative.conversionMode !== 'FIXED' &&
        alternative.conversionMode !== 'VARIABLE'
      ) {
        throw new ProductValidationError('Unit conversion mode is invalid.')
      }

      const rawConversion = alternative.conversionToBase?.trim() || null

      if (alternative.conversionMode === 'VARIABLE') {
        if (rawConversion !== null) {
          throw new ProductValidationError(
            'Variable units cannot have a fixed conversion value.',
          )
        }

        normalized.push({
          unitId,
          conversionMode: 'VARIABLE',
          conversionToBase: null,
        })
        continue
      }

      if (rawConversion === null) {
        throw new ProductValidationError(
          'Fixed units require a conversion value.',
        )
      }

      normalized.push({
        unitId,
        conversionMode: 'FIXED',
        conversionToBase: parsePositiveConversion(
          rawConversion,
          'Unit conversion',
        ),
      })
    }

    await repository.deactivateAlternativeUnits(
      this.tenantId,
      productId,
      product.baseUnitId,
    )
    await repository.ensureBaseProductUnit(
      this.tenantId,
      productId,
      product.baseUnitId,
    )

    for (const alternative of normalized) {
      await repository.insertAlternativeUnit({
        tenantId: this.tenantId,
        productId,
        ...alternative,
      })
    }
  }

  private async replaceSpecificationsInTransaction(
    database: DatabaseClient,
    productId: string,
    input: SpecificationInput[],
  ): Promise<void> {
    const repository = new ProductMasterRepository(database)
    await this.requireLockedProductForAdvanced(repository, productId)

    const specifications = input.map((specification) => ({
      name: requireName(specification.name, 'Specification name'),
      value: requireName(specification.value, 'Specification value'),
    }))

    await repository.replaceSpecificationsRows(
      this.tenantId,
      productId,
      specifications,
    )
  }

  private async replaceVariantConfigurationInTransaction(
    database: DatabaseClient,
    productId: string,
    input: ReplaceVariantConfigurationInput,
  ): Promise<void> {
    const repository = new ProductMasterRepository(database)
    await this.requireLockedProductForAdvanced(repository, productId)
    const normalized = normalizeVariantConfiguration(input)
    await repository.lockNonDefaultVariants(this.tenantId, productId)
    const existingVariants = await repository.listNonDefaultVariants(
      this.tenantId,
      productId,
    )

    if (!normalized.enabled) {
      const historicalVariant = existingVariants.find(
        (variant) => variant.hasInventoryHistory,
      )
      if (historicalVariant) {
        throw new ProductValidationError(
          'Variants with stock or inventory history cannot be disabled.',
        )
      }

      for (const variant of existingVariants) {
        if (variant.isActive) {
          await repository.setAdvancedVariantActive(
            this.tenantId,
            productId,
            variant.id,
            false,
          )
        }
      }

      await repository.clearProductOptionDefinitions(
        this.tenantId,
        productId,
      )
      await repository.setProductVariantsEnabled(
        this.tenantId,
        productId,
        false,
      )
      return
    }

    const existingById = new Map(
      existingVariants.map((variant) => [variant.id, variant]),
    )
    const incomingIds = new Set(
      normalized.variants
        .map((variant) => variant.id)
        .filter((id): id is string => Boolean(id)),
    )

    for (const existing of existingVariants) {
      if (existing.hasInventoryHistory && !incomingIds.has(existing.id)) {
        throw new ProductValidationError(
          'A Variant with inventory history cannot be removed.',
        )
      }
    }

    for (const variant of normalized.variants) {
      if (!variant.id) {
        continue
      }

      const existing = existingById.get(variant.id)
      if (!existing) {
        throw new ProductValidationError(
          'Variant does not belong to this Product and tenant.',
        )
      }

      if (
        existing.hasInventoryHistory &&
        canonicalizeSelections(existing.selections) !==
          variant.canonicalSelection
      ) {
        throw new ProductValidationError(
          'A Variant with inventory history cannot change its option combination.',
        )
      }
    }

    for (const existing of existingVariants) {
      if (!incomingIds.has(existing.id) && !existing.hasInventoryHistory) {
        await repository.setAdvancedVariantActive(
          this.tenantId,
          productId,
          existing.id,
          false,
        )
      }
    }

    await repository.clearProductOptionDefinitions(this.tenantId, productId)

    const optionValueIds = new Map<string, Map<string, string>>()
    for (const [optionIndex, option] of normalized.options.entries()) {
      const definition = await repository.createOptionDefinition({
        tenantId: this.tenantId,
        productId,
        name: option.name,
        sortOrder: optionIndex,
      })
      const valueIds = new Map<string, string>()

      for (const [valueIndex, value] of option.values.entries()) {
        const created = await repository.createOptionValue({
          tenantId: this.tenantId,
          optionDefinitionId: definition.id,
          value: value.value,
          sortOrder: valueIndex,
        })
        valueIds.set(value.key, created.id)
      }

      optionValueIds.set(option.key, valueIds)
    }

    for (const variant of normalized.variants) {
      let variantId = variant.id

      if (variantId) {
        const updated = await repository.updateAdvancedVariant({
          tenantId: this.tenantId,
          productId,
          variantId,
          displayName: variant.displayName,
          sku: variant.sku,
          defaultPurchasePricePaisa:
            variant.defaultPurchasePricePaisa,
          defaultSellingPricePaisa:
            variant.defaultSellingPricePaisa,
          minimumStockBaseQty: variant.minimumStockBaseQty,
        })

        if (!updated) {
          throw new ProductValidationError(
            'Variant does not belong to this Product and tenant.',
          )
        }
      } else {
        const created = await repository.insertAdvancedVariant({
          tenantId: this.tenantId,
          productId,
          displayName: variant.displayName,
          sku: variant.sku,
          defaultPurchasePricePaisa:
            variant.defaultPurchasePricePaisa,
          defaultSellingPricePaisa:
            variant.defaultSellingPricePaisa,
          minimumStockBaseQty: variant.minimumStockBaseQty,
        })
        variantId = created.id
      }

      if (!variantId) {
        throw new ProductValidationError('Variant id is required.')
      }

      for (const option of normalized.options) {
        const selectedKey = variant.selectionKeys[option.key]
        if (!selectedKey) {
          throw new ProductValidationError(
            'Variant option mapping is invalid.',
          )
        }

        const optionValueId = optionValueIds
          .get(option.key)
          ?.get(selectedKey)

        if (!optionValueId) {
          throw new ProductValidationError(
            'Variant option mapping is invalid.',
          )
        }

        await repository.mapVariantOptionValue({
          tenantId: this.tenantId,
          variantId,
          optionValueId,
        })
      }
    }

    await repository.setProductVariantsEnabled(
      this.tenantId,
      productId,
      true,
    )
  }

}
