import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from './product.errors'
import { ProductMasterRepository } from './product-master.repository'
import type {
  CategoryRecord,
  CreateUnitInput,
  UnitRecord,
} from './product.types'
import { requireName } from './product.validation'

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  )
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
}
