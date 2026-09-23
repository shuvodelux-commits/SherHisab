import type { DatabaseClient } from '../../db/request-database'
import type {
  CategoryRecord,
  CreateUnitInput,
  ConversionMode,
  ProductAdvancedConfiguration,
  ProductAlternativeUnitRecord,
  ProductDetail,
  ProductListFilters,
  ProductListItem,
  ProductSpecificationRecord,
  ProductStockTarget,
  ProductVariantDetail,
  TrackingMode,
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

interface ProductRow {
  id: string
  name: string
  brand: string
  category_id: string | null
  category_name: string | null
  category_is_active: boolean | null
  base_unit_id: string
  base_unit_name: string
  base_unit_symbol: string | null
  base_unit_is_active: boolean
  default_variant_id: string
  variant_count: number
  default_purchase_price_paisa: string
  default_selling_price_paisa: string
  stock_base_qty: string
  minimum_stock_base_qty: string
  tracking_mode: TrackingMode
  variants_enabled: boolean
  is_active: boolean
  primary_barcode: string | null
}

interface ProductInsertFields {
  name: string
  brand: string
  categoryId: string | null
  baseUnitId: string
  trackingMode: TrackingMode
}

interface VariantInsertFields {
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
}

type ProductUpdateFields = ProductInsertFields

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

function mapProduct(row: ProductRow): ProductDetail {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category:
      row.category_id && row.category_name !== null
        ? {
            id: row.category_id,
            name: row.category_name,
            isActive: row.category_is_active ?? false,
          }
        : null,
    baseUnit: {
      id: row.base_unit_id,
      name: row.base_unit_name,
      symbol: row.base_unit_symbol,
      isActive: row.base_unit_is_active,
    },
    defaultVariantId: row.default_variant_id,
    variantCount: row.variant_count,
    defaultPurchasePricePaisa: row.default_purchase_price_paisa,
    defaultSellingPricePaisa: row.default_selling_price_paisa,
    stockBaseQty: row.stock_base_qty,
    minimumStockBaseQty: row.minimum_stock_base_qty,
    trackingMode: row.tracking_mode,
    variantsEnabled: row.variants_enabled,
    isActive: row.is_active,
    primaryBarcode: row.primary_barcode,
  }
}

const productSelect = `
  SELECT
    p.id,
    p.name,
    p.brand,
    c.id AS category_id,
    c.name AS category_name,
    c.is_active AS category_is_active,
    u.id AS base_unit_id,
    u.name AS base_unit_name,
    u.symbol AS base_unit_symbol,
    u.is_active AS base_unit_is_active,
    dv.id AS default_variant_id,
    (
      SELECT COUNT(*)::int
      FROM product_variants pv_count
      WHERE pv_count.tenant_id = p.tenant_id
        AND pv_count.product_id = p.id
        AND pv_count.is_active
        AND (
          NOT p.variants_enabled
          OR NOT pv_count.is_default
        )
    ) AS variant_count,
    dv.default_purchase_price_paisa::text AS default_purchase_price_paisa,
    dv.default_selling_price_paisa::text AS default_selling_price_paisa,
    (
      SELECT trim_scale(COALESCE(SUM(im.base_qty_delta), 0))::text
      FROM product_variants pv_stock
      LEFT JOIN inventory_movements im
        ON im.tenant_id = pv_stock.tenant_id
       AND im.variant_id = pv_stock.id
      WHERE pv_stock.tenant_id = p.tenant_id
        AND pv_stock.product_id = p.id
        AND pv_stock.is_active
    ) AS stock_base_qty,
    trim_scale(dv.minimum_stock_base_qty)::text AS minimum_stock_base_qty,
    p.tracking_mode,
    p.variants_enabled,
    p.is_active,
    (
      SELECT pb.barcode
      FROM product_barcodes pb
      WHERE pb.tenant_id = p.tenant_id
        AND pb.variant_id = dv.id
        AND pb.is_active
        AND pb.is_primary
      ORDER BY pb.created_at DESC, pb.id
      LIMIT 1
    ) AS primary_barcode
  FROM products p
  LEFT JOIN product_categories c
    ON c.tenant_id = p.tenant_id
   AND c.id = p.category_id
  JOIN units u
    ON u.tenant_id = p.tenant_id
   AND u.id = p.base_unit_id
  JOIN product_variants dv
    ON dv.tenant_id = p.tenant_id
   AND dv.product_id = p.id
   AND dv.is_default
`

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

  async insertProduct(
    tenantId: string,
    fields: ProductInsertFields,
  ): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO products
       (tenant_id, name, brand, category_id, base_unit_id, tracking_mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        tenantId,
        fields.name,
        fields.brand,
        fields.categoryId,
        fields.baseUnitId,
        fields.trackingMode,
      ],
    )

    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create product')
    }

    return row
  }

  async insertDefaultVariant(
    tenantId: string,
    productId: string,
    fields: VariantInsertFields,
  ): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO product_variants
       (
         tenant_id,
         product_id,
         default_purchase_price_paisa,
         default_selling_price_paisa,
         minimum_stock_base_qty,
         is_default
       )
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id`,
      [
        tenantId,
        productId,
        fields.defaultPurchasePricePaisa,
        fields.defaultSellingPricePaisa,
        fields.minimumStockBaseQty,
      ],
    )

    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create default product variant')
    }

    return row
  }

  async insertBaseProductUnit(
    tenantId: string,
    productId: string,
    unitId: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO product_units
       (tenant_id, product_id, unit_id, conversion_mode, conversion_to_base)
       VALUES ($1, $2, $3, 'FIXED', 1)`,
      [tenantId, productId, unitId],
    )
  }

  async replaceBaseProductUnit(
    tenantId: string,
    productId: string,
    unitId: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE product_units
       SET is_active = FALSE, updated_at = NOW()
       WHERE tenant_id = $1
         AND product_id = $2
         AND is_active`,
      [tenantId, productId],
    )

    await this.insertBaseProductUnit(tenantId, productId, unitId)
  }

  async insertPrimaryBarcode(
    tenantId: string,
    variantId: string,
    unitId: string,
    barcode: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO product_barcodes
       (tenant_id, variant_id, unit_id, barcode, is_primary)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [tenantId, variantId, unitId, barcode],
    )
  }

  async replacePrimaryBarcode(
    tenantId: string,
    variantId: string,
    unitId: string,
    barcode: string | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE product_barcodes
       SET is_active = FALSE
       WHERE tenant_id = $1
         AND variant_id = $2
         AND is_active
         AND is_primary`,
      [tenantId, variantId],
    )

    if (barcode) {
      await this.insertPrimaryBarcode(tenantId, variantId, unitId, barcode)
    }
  }

  async findProductDetail(
    tenantId: string,
    productId: string,
  ): Promise<ProductDetail | null> {
    const result = await this.db.query<ProductRow>(
      `${productSelect}
       WHERE p.tenant_id = $1 AND p.id = $2`,
      [tenantId, productId],
    )

    const row = result.rows[0]
    return row ? mapProduct(row) : null
  }

  async listProducts(
    tenantId: string,
    filters: ProductListFilters,
  ): Promise<ProductListItem[]> {
    const search = filters.search?.trim() || null
    const categoryId = filters.categoryId?.trim() || null
    const brand = filters.brand?.trim() || null
    const status = filters.status ?? 'active'
    const limit = filters.limit ?? 50
    const offset = filters.offset ?? 0

    const result = await this.db.query<ProductRow>(
      `${productSelect}
       WHERE p.tenant_id = $1
         AND (
           $2::text IS NULL
           OR p.name ILIKE '%' || $2 || '%'
           OR p.brand ILIKE '%' || $2 || '%'
         )
         AND ($3::uuid IS NULL OR p.category_id = $3)
         AND ($4::text IS NULL OR lower(btrim(p.brand)) = lower(btrim($4)))
         AND (
           $5::text = 'all'
           OR ($5::text = 'active' AND p.is_active)
           OR ($5::text = 'inactive' AND NOT p.is_active)
         )
       ORDER BY lower(p.name), p.id
       LIMIT $6 OFFSET $7`,
      [tenantId, search, categoryId, brand, status, limit, offset],
    )

    return result.rows.map(mapProduct)
  }

  async countProducts(
    tenantId: string,
    filters: ProductListFilters,
  ): Promise<number> {
    const search = filters.search?.trim() || null
    const categoryId = filters.categoryId?.trim() || null
    const brand = filters.brand?.trim() || null
    const status = filters.status ?? 'active'

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM products p
       WHERE p.tenant_id = $1
         AND (
           $2::text IS NULL
           OR p.name ILIKE '%' || $2 || '%'
           OR p.brand ILIKE '%' || $2 || '%'
         )
         AND ($3::uuid IS NULL OR p.category_id = $3)
         AND ($4::text IS NULL OR lower(btrim(p.brand)) = lower(btrim($4)))
         AND (
           $5::text = 'all'
           OR ($5::text = 'active' AND p.is_active)
           OR ($5::text = 'inactive' AND NOT p.is_active)
         )`,
      [tenantId, search, categoryId, brand, status],
    )

    return result.rows[0]?.count ?? 0
  }

  async updateProductIdentity(
    tenantId: string,
    productId: string,
    fields: ProductUpdateFields,
  ): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE products
       SET name = $3,
           brand = $4,
           category_id = $5,
           base_unit_id = $6,
           tracking_mode = $7,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        productId,
        fields.name,
        fields.brand,
        fields.categoryId,
        fields.baseUnitId,
        fields.trackingMode,
      ],
    )

    return (result.rowCount ?? 0) > 0
  }

  async updateDefaultVariant(
    tenantId: string,
    variantId: string,
    fields: VariantInsertFields,
  ): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE product_variants
       SET default_purchase_price_paisa = $3,
           default_selling_price_paisa = $4,
           minimum_stock_base_qty = $5,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND is_default`,
      [
        tenantId,
        variantId,
        fields.defaultPurchasePricePaisa,
        fields.defaultSellingPricePaisa,
        fields.minimumStockBaseQty,
      ],
    )

    return (result.rowCount ?? 0) > 0
  }

  async setProductActive(
    tenantId: string,
    productId: string,
    active: boolean,
  ): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE products
       SET is_active = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, productId, active],
    )

    return (result.rowCount ?? 0) > 0
  }

  async lockDefaultVariant(
    tenantId: string,
    variantId: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id
       FROM product_variants
       WHERE tenant_id = $1
         AND id = $2
         AND is_default
       FOR UPDATE`,
      [tenantId, variantId],
    )

    return Boolean(result.rows[0])
  }

  async hasInventoryHistory(
    tenantId: string,
    variantId: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ has_history: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM inventory_movements
         WHERE tenant_id = $1 AND variant_id = $2
       ) AS has_history`,
      [tenantId, variantId],
    )

    return result.rows[0]?.has_history ?? false
  }

  async lockProductForAdvanced(
    tenantId: string,
    productId: string,
  ): Promise<{
    id: string
    baseUnitId: string
    variantsEnabled: boolean
  } | null> {
    const result = await this.db.query<{
      id: string
      base_unit_id: string
      variants_enabled: boolean
    }>(
      `SELECT id, base_unit_id, variants_enabled
       FROM products
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, productId],
    )

    const row = result.rows[0]
    return row
      ? {
          id: row.id,
          baseUnitId: row.base_unit_id,
          variantsEnabled: row.variants_enabled,
        }
      : null
  }

  async deactivateAlternativeUnits(
    tenantId: string,
    productId: string,
    baseUnitId: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE product_units
       SET is_active = FALSE, updated_at = NOW()
       WHERE tenant_id = $1
         AND product_id = $2
         AND unit_id <> $3
         AND is_active`,
      [tenantId, productId, baseUnitId],
    )
  }

  async insertAlternativeUnit(input: {
    tenantId: string
    productId: string
    unitId: string
    conversionMode: ConversionMode
    conversionToBase: string | null
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO product_units
       (
         tenant_id,
         product_id,
         unit_id,
         conversion_mode,
         conversion_to_base
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.tenantId,
        input.productId,
        input.unitId,
        input.conversionMode,
        input.conversionToBase,
      ],
    )
  }

  async ensureBaseProductUnit(
    tenantId: string,
    productId: string,
    baseUnitId: string,
  ): Promise<void> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id
       FROM product_units
       WHERE tenant_id = $1
         AND product_id = $2
         AND unit_id = $3
         AND is_active
       LIMIT 1`,
      [tenantId, productId, baseUnitId],
    )

    if (result.rows[0]) {
      return
    }

    await this.insertBaseProductUnit(tenantId, productId, baseUnitId)
  }

  async replaceSpecificationsRows(
    tenantId: string,
    productId: string,
    specifications: Array<{ name: string; value: string }>,
  ): Promise<void> {
    await this.db.query(
      `DELETE FROM product_specifications
       WHERE tenant_id = $1 AND product_id = $2`,
      [tenantId, productId],
    )

    for (const [index, specification] of specifications.entries()) {
      await this.db.query(
        `INSERT INTO product_specifications
         (tenant_id, product_id, name, value, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          productId,
          specification.name,
          specification.value,
          index,
        ],
      )
    }
  }

  async listAlternativeUnits(
    tenantId: string,
    productId: string,
    baseUnitId: string,
  ): Promise<ProductAlternativeUnitRecord[]> {
    const result = await this.db.query<{
      id: string
      unit_id: string
      unit_name: string
      unit_symbol: string | null
      unit_is_active: boolean
      conversion_mode: ConversionMode
      conversion_to_base: string | null
    }>(
      `SELECT pu.id,
              u.id AS unit_id,
              u.name AS unit_name,
              u.symbol AS unit_symbol,
              u.is_active AS unit_is_active,
              pu.conversion_mode,
              CASE
                WHEN pu.conversion_to_base IS NULL THEN NULL
                ELSE trim_scale(pu.conversion_to_base)::text
              END AS conversion_to_base
       FROM product_units pu
       JOIN units u
         ON u.tenant_id = pu.tenant_id
        AND u.id = pu.unit_id
       WHERE pu.tenant_id = $1
         AND pu.product_id = $2
         AND pu.unit_id <> $3
         AND pu.is_active
       ORDER BY lower(u.name), pu.id`,
      [tenantId, productId, baseUnitId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      unit: {
        id: row.unit_id,
        name: row.unit_name,
        symbol: row.unit_symbol,
        isActive: row.unit_is_active,
      },
      conversionMode: row.conversion_mode,
      conversionToBase: row.conversion_to_base,
    }))
  }

  async listSpecifications(
    tenantId: string,
    productId: string,
  ): Promise<ProductSpecificationRecord[]> {
    const result = await this.db.query<{
      id: string
      name: string
      value: string
      sort_order: number
    }>(
      `SELECT id, name, value, sort_order
       FROM product_specifications
       WHERE tenant_id = $1 AND product_id = $2
       ORDER BY sort_order, id`,
      [tenantId, productId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      value: row.value,
      sortOrder: row.sort_order,
    }))
  }

  async lockNonDefaultVariants(
    tenantId: string,
    productId: string,
  ): Promise<void> {
    await this.db.query(
      `SELECT id
       FROM product_variants
       WHERE tenant_id = $1
         AND product_id = $2
         AND NOT is_default
       ORDER BY id
       FOR UPDATE`,
      [tenantId, productId],
    )
  }

  async listStockTargets(
    tenantId: string,
    productId: string,
  ): Promise<ProductStockTarget[]> {
    const result = await this.db.query<{
      id: string
      display_name: string | null
      stock_base_qty: string
      has_inventory_history: boolean
      is_default: boolean
      is_active: boolean
    }>(
      `SELECT pv.id,
              pv.display_name,
              (
                SELECT trim_scale(COALESCE(SUM(im.base_qty_delta), 0))::text
                FROM inventory_movements im
                WHERE im.tenant_id = pv.tenant_id
                  AND im.variant_id = pv.id
              ) AS stock_base_qty,
              EXISTS (
                SELECT 1
                FROM inventory_movements im_history
                WHERE im_history.tenant_id = pv.tenant_id
                  AND im_history.variant_id = pv.id
                UNION ALL
                SELECT 1
                FROM inventory_lots il_history
                WHERE il_history.tenant_id = pv.tenant_id
                  AND il_history.variant_id = pv.id
              ) AS has_inventory_history,
              pv.is_default,
              pv.is_active
       FROM product_variants pv
       WHERE pv.tenant_id = $1
         AND pv.product_id = $2
       ORDER BY pv.is_default DESC, pv.created_at, pv.id`,
      [tenantId, productId],
    )

    return result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name ?? '',
      stockBaseQty: row.stock_base_qty,
      hasInventoryHistory: row.has_inventory_history,
      isDefault: row.is_default,
      isActive: row.is_active,
    }))
  }

  async listNonDefaultVariants(
    tenantId: string,
    productId: string,
  ): Promise<ProductVariantDetail[]> {
    const result = await this.db.query<{
      id: string
      display_name: string | null
      sku: string | null
      default_purchase_price_paisa: string
      default_selling_price_paisa: string
      minimum_stock_base_qty: string
      stock_base_qty: string
      has_inventory_history: boolean
      is_active: boolean
      option_name: string | null
      option_value: string | null
    }>(
      `SELECT pv.id,
              pv.display_name,
              pv.sku,
              pv.default_purchase_price_paisa::text,
              pv.default_selling_price_paisa::text,
              trim_scale(pv.minimum_stock_base_qty)::text AS minimum_stock_base_qty,
              (
                SELECT trim_scale(COALESCE(SUM(im.base_qty_delta), 0))::text
                FROM inventory_movements im
                WHERE im.tenant_id = pv.tenant_id
                  AND im.variant_id = pv.id
              ) AS stock_base_qty,
              EXISTS (
                SELECT 1
                FROM inventory_movements im_history
                WHERE im_history.tenant_id = pv.tenant_id
                  AND im_history.variant_id = pv.id
                UNION ALL
                SELECT 1
                FROM inventory_lots il_history
                WHERE il_history.tenant_id = pv.tenant_id
                  AND il_history.variant_id = pv.id
              ) AS has_inventory_history,
              pv.is_active,
              pod.name AS option_name,
              pov.value AS option_value
       FROM product_variants pv
       LEFT JOIN product_variant_option_values pvov
         ON pvov.tenant_id = pv.tenant_id
        AND pvov.variant_id = pv.id
       LEFT JOIN product_option_values pov
         ON pov.tenant_id = pvov.tenant_id
        AND pov.id = pvov.option_value_id
       LEFT JOIN product_option_definitions pod
         ON pod.tenant_id = pov.tenant_id
        AND pod.id = pov.option_definition_id
       WHERE pv.tenant_id = $1
         AND pv.product_id = $2
         AND NOT pv.is_default
       ORDER BY pv.created_at, pv.id, pod.sort_order, pod.id, pov.sort_order, pov.id`,
      [tenantId, productId],
    )

    const variants = new Map<string, ProductVariantDetail>()

    for (const row of result.rows) {
      let variant = variants.get(row.id)

      if (!variant) {
        variant = {
          id: row.id,
          displayName: row.display_name ?? '',
          sku: row.sku,
          defaultPurchasePricePaisa: row.default_purchase_price_paisa,
          defaultSellingPricePaisa: row.default_selling_price_paisa,
          minimumStockBaseQty: row.minimum_stock_base_qty,
          stockBaseQty: row.stock_base_qty,
          hasInventoryHistory: row.has_inventory_history,
          selections: {},
          isActive: row.is_active,
        }
        variants.set(row.id, variant)
      }

      if (row.option_name && row.option_value) {
        variant.selections[row.option_name] = row.option_value
      }
    }

    return [...variants.values()]
  }

  async setProductVariantsEnabled(
    tenantId: string,
    productId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.db.query(
      `UPDATE products
       SET variants_enabled = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, productId, enabled],
    )
  }

  async clearProductOptionDefinitions(
    tenantId: string,
    productId: string,
  ): Promise<void> {
    await this.db.query(
      `DELETE FROM product_option_definitions
       WHERE tenant_id = $1 AND product_id = $2`,
      [tenantId, productId],
    )
  }

  async createOptionDefinition(input: {
    tenantId: string
    productId: string
    name: string
    sortOrder: number
  }): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO product_option_definitions
       (tenant_id, product_id, name, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.tenantId, input.productId, input.name, input.sortOrder],
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create Product option definition')
    }

    return row
  }

  async createOptionValue(input: {
    tenantId: string
    optionDefinitionId: string
    value: string
    sortOrder: number
  }): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO product_option_values
       (tenant_id, option_definition_id, value, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        input.tenantId,
        input.optionDefinitionId,
        input.value,
        input.sortOrder,
      ],
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create Product option value')
    }

    return row
  }

  async insertAdvancedVariant(input: {
    tenantId: string
    productId: string
    displayName: string
    sku: string | null
    defaultPurchasePricePaisa: string
    defaultSellingPricePaisa: string
    minimumStockBaseQty: string
  }): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO product_variants
       (
         tenant_id,
         product_id,
         display_name,
         sku,
         default_purchase_price_paisa,
         default_selling_price_paisa,
         minimum_stock_base_qty,
         is_default,
         is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, TRUE)
       RETURNING id`,
      [
        input.tenantId,
        input.productId,
        input.displayName,
        input.sku,
        input.defaultPurchasePricePaisa,
        input.defaultSellingPricePaisa,
        input.minimumStockBaseQty,
      ],
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create Product variant')
    }

    return row
  }

  async updateAdvancedVariant(input: {
    tenantId: string
    productId: string
    variantId: string
    displayName: string
    sku: string | null
    defaultPurchasePricePaisa: string
    defaultSellingPricePaisa: string
    minimumStockBaseQty: string
  }): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE product_variants
       SET display_name = $4,
           sku = $5,
           default_purchase_price_paisa = $6,
           default_selling_price_paisa = $7,
           minimum_stock_base_qty = $8,
           is_active = TRUE,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND product_id = $2
         AND id = $3
         AND NOT is_default`,
      [
        input.tenantId,
        input.productId,
        input.variantId,
        input.displayName,
        input.sku,
        input.defaultPurchasePricePaisa,
        input.defaultSellingPricePaisa,
        input.minimumStockBaseQty,
      ],
    )

    return (result.rowCount ?? 0) > 0
  }

  async setAdvancedVariantActive(
    tenantId: string,
    productId: string,
    variantId: string,
    active: boolean,
  ): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE product_variants
       SET is_active = $4, updated_at = NOW()
       WHERE tenant_id = $1
         AND product_id = $2
         AND id = $3
         AND NOT is_default`,
      [tenantId, productId, variantId, active],
    )

    return (result.rowCount ?? 0) > 0
  }

  async mapVariantOptionValue(input: {
    tenantId: string
    variantId: string
    optionValueId: string
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO product_variant_option_values
       (tenant_id, variant_id, option_value_id)
       VALUES ($1, $2, $3)`,
      [input.tenantId, input.variantId, input.optionValueId],
    )
  }

  async getAdvancedConfiguration(
    tenantId: string,
    productId: string,
    baseUnitId: string,
  ): Promise<ProductAdvancedConfiguration> {
    const [alternativeUnits, specifications, variants] = await Promise.all([
      this.listAlternativeUnits(tenantId, productId, baseUnitId),
      this.listSpecifications(tenantId, productId),
      this.listNonDefaultVariants(tenantId, productId),
    ])

    return {
      alternativeUnits,
      specifications,
      variants,
    }
  }

}
