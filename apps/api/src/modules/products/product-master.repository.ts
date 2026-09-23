import type { DatabaseClient } from '../../db/request-database'
import type {
  CategoryRecord,
  CreateUnitInput,
  UnitRecord,
} from './product.types'

interface CategoryRow {
  id: string
  name: string
  is_active: boolean
}

interface UnitRow {
  id: string
  name: string
  symbol: string | null
  is_active: boolean
}

function mapCategory(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  }
}

function mapUnit(row: UnitRow): UnitRecord {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    isActive: row.is_active,
  }
}

export class ProductMasterRepository {
  constructor(private readonly db: DatabaseClient) {}

  async listCategories(
    tenantId: string,
    includeInactive = false,
  ): Promise<CategoryRecord[]> {
    const result = await this.db.query<CategoryRow>(
      `SELECT id, name, is_active
       FROM product_categories
       WHERE tenant_id = $1
         AND ($2::boolean OR is_active)
       ORDER BY lower(name), id`,
      [tenantId, includeInactive],
    )

    return result.rows.map(mapCategory)
  }

  async findCategoryById(
    tenantId: string,
    categoryId: string,
  ): Promise<CategoryRecord | null> {
    const result = await this.db.query<CategoryRow>(
      `SELECT id, name, is_active
       FROM product_categories
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, categoryId],
    )

    const row = result.rows[0]
    return row ? mapCategory(row) : null
  }

  async createCategory(
    tenantId: string,
    name: string,
  ): Promise<CategoryRecord> {
    const result = await this.db.query<CategoryRow>(
      `INSERT INTO product_categories (tenant_id, name)
       VALUES ($1, $2)
       RETURNING id, name, is_active`,
      [tenantId, name],
    )

    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create category')
    }

    return mapCategory(row)
  }

  async setCategoryActive(
    tenantId: string,
    categoryId: string,
    active: boolean,
  ): Promise<CategoryRecord | null> {
    const result = await this.db.query<CategoryRow>(
      `UPDATE product_categories
       SET is_active = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, name, is_active`,
      [tenantId, categoryId, active],
    )

    const row = result.rows[0]
    return row ? mapCategory(row) : null
  }

  async listUnits(
    tenantId: string,
    includeInactive = false,
  ): Promise<UnitRecord[]> {
    const result = await this.db.query<UnitRow>(
      `SELECT id, name, symbol, is_active
       FROM units
       WHERE tenant_id = $1
         AND ($2::boolean OR is_active)
       ORDER BY lower(name), id`,
      [tenantId, includeInactive],
    )

    return result.rows.map(mapUnit)
  }

  async findUnitById(
    tenantId: string,
    unitId: string,
  ): Promise<UnitRecord | null> {
    const result = await this.db.query<UnitRow>(
      `SELECT id, name, symbol, is_active
       FROM units
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, unitId],
    )

    const row = result.rows[0]
    return row ? mapUnit(row) : null
  }

  async createUnit(
    tenantId: string,
    input: CreateUnitInput,
  ): Promise<UnitRecord> {
    const result = await this.db.query<UnitRow>(
      `INSERT INTO units (tenant_id, name, symbol)
       VALUES ($1, $2, $3)
       RETURNING id, name, symbol, is_active`,
      [tenantId, input.name, input.symbol ?? null],
    )

    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create unit')
    }

    return mapUnit(row)
  }

  async setUnitActive(
    tenantId: string,
    unitId: string,
    active: boolean,
  ): Promise<UnitRecord | null> {
    const result = await this.db.query<UnitRow>(
      `UPDATE units
       SET is_active = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, name, symbol, is_active`,
      [tenantId, unitId, active],
    )

    const row = result.rows[0]
    return row ? mapUnit(row) : null
  }
}
