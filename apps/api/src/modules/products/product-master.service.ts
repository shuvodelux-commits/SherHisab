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
  CategoryRecord,
  CreateProductInput,
  CreateUnitInput,
  ProductDetail,
  ProductListFilters,
  ProductListResult,
  TrackingMode,
  UnitRecord,
  UpdateProductInput,
} from './product.types'
import {
  parseMoneyPaisa,
  parseQuantity,
  requireName,
} from './product.validation'

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

    const limit = clampInteger(filters.limit, 50, 1, 100)
    const offset = clampInteger(filters.offset, 0, 0, Number.MAX_SAFE_INTEGER)
    const normalizedFilters: ProductListFilters = {
      ...filters,
      status,
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

      if (
        await this.repository.hasInventoryHistory(
          this.tenantId,
          current.defaultVariantId,
        )
      ) {
        throw new ProductValidationError(
          'Base unit cannot be changed after inventory history exists',
        )
      }
    }

    try {
      await withDatabaseTransaction(this.database, async (database) => {
        const repository = new ProductMasterRepository(database)
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
}
