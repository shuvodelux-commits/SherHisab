import type { DatabaseClient } from '../../db/request-database'
import type { AllocationPolicy } from '../products/tracking.types'
import type { TrackingMode } from '../products/product.types'
import type { PosProductSearchResult } from './pos.types'

interface PosProductSearchRow {
  product_id: string
  variant_id: string
  product_name: string
  variant_name: string | null
  sku: string | null
  primary_barcode: string | null
  brand: string
  category_name: string | null
  unit_id: string
  unit_name: string
  unit_symbol: string | null
  current_selling_price_paisa: string
  available_own_base_qty: string
  tracking_mode: TrackingMode
  allocation_policy: AllocationPolicy
  variants_enabled: boolean
  configured_purchase_price_paisa: string
}

function mapSearchResult(
  row: PosProductSearchRow,
  includeConfiguredPurchasePrice: boolean,
): PosProductSearchResult {
  return {
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.product_name,
    variantName: row.variant_name,
    sku: row.sku,
    primaryBarcode: row.primary_barcode,
    brand: row.brand,
    categoryName: row.category_name,
    unitId: row.unit_id,
    unitName: row.unit_name,
    unitSymbol: row.unit_symbol,
    currentSellingPricePaisa: row.current_selling_price_paisa,
    availableOwnBaseQty: row.available_own_base_qty,
    trackingMode: row.tracking_mode,
    allocationPolicy: row.allocation_policy,
    variantsEnabled: row.variants_enabled,
    ...(includeConfiguredPurchasePrice
      ? {
          configuredPurchasePricePaisa:
            row.configured_purchase_price_paisa,
        }
      : {}),
  }
}

export class PosRepository {
  constructor(private readonly db: DatabaseClient) {}

  async searchProducts(
    tenantId: string,
    query: string,
    limit: number,
    includeConfiguredPurchasePrice = false,
  ): Promise<PosProductSearchResult[]> {
    const result = await this.db.query<PosProductSearchRow>(
      `WITH candidates AS (
         SELECT
           p.id AS product_id,
           pv.id AS variant_id,
           p.name AS product_name,
           pv.display_name AS variant_name,
           pv.sku,
           (
             SELECT pb.barcode
             FROM product_barcodes pb
             WHERE pb.tenant_id = pv.tenant_id
               AND pb.variant_id = pv.id
               AND pb.is_active
             ORDER BY pb.is_primary DESC, pb.created_at DESC, pb.id
             LIMIT 1
           ) AS primary_barcode,
           p.brand,
           c.name AS category_name,
           u.id AS unit_id,
           u.name AS unit_name,
           u.symbol AS unit_symbol,
           COALESCE(
             (
               SELECT lot.default_sell_price_paisa
               FROM inventory_lots lot
               WHERE lot.tenant_id = pv.tenant_id
                 AND lot.variant_id = pv.id
                 AND lot.status = 'ACTIVE'
                 AND lot.remaining_base_qty > 0
                 AND (
                   p.tracking_mode <> 'BATCH_EXPIRY'
                   OR lot.expires_on IS NULL
                   OR lot.expires_on >= CURRENT_DATE
                 )
               ORDER BY
                 CASE
                   WHEN p.allocation_policy = 'FEFO'
                   THEN lot.expires_on
                   ELSE NULL
                 END ASC NULLS LAST,
                 lot.received_on ASC,
                 lot.id ASC
               LIMIT 1
             ),
             pv.default_selling_price_paisa
           )::text AS current_selling_price_paisa,
           (
             SELECT trim_scale(
               COALESCE(SUM(movement.base_qty_delta), 0)
             )::text
             FROM inventory_movements movement
             WHERE movement.tenant_id = pv.tenant_id
               AND movement.variant_id = pv.id
           ) AS available_own_base_qty,
           p.tracking_mode,
           p.allocation_policy,
           p.variants_enabled,
           pv.default_purchase_price_paisa::text
             AS configured_purchase_price_paisa,
           CASE
             WHEN EXISTS (
               SELECT 1
               FROM product_barcodes exact_barcode
               WHERE exact_barcode.tenant_id = pv.tenant_id
                 AND exact_barcode.variant_id = pv.id
                 AND exact_barcode.is_active
                 AND lower(btrim(exact_barcode.barcode)) = lower($2)
             ) THEN 1
             WHEN pv.sku IS NOT NULL
               AND lower(btrim(pv.sku)) = lower($2) THEN 2
             WHEN lower(btrim(p.name)) = lower($2) THEN 3
             WHEN lower(p.name) LIKE lower($2) || '%'
               OR lower(COALESCE(pv.display_name, ''))
                 LIKE lower($2) || '%' THEN 4
             WHEN EXISTS (
               SELECT 1
               FROM regexp_split_to_table(
                 lower(
                   concat_ws(
                     ' ',
                     p.name,
                     COALESCE(pv.display_name, ''),
                     p.brand,
                     COALESCE(c.name, ''),
                     u.name,
                     COALESCE(u.symbol, '')
                   )
                 ),
                 '[^[:alnum:]]+'
               ) AS word
               WHERE word LIKE lower($2) || '%'
             ) THEN 5
             ELSE 6
           END AS search_rank
         FROM products p
         JOIN product_variants pv
           ON pv.tenant_id = p.tenant_id
          AND pv.product_id = p.id
          AND pv.is_active
         JOIN units u
           ON u.tenant_id = p.tenant_id
          AND u.id = p.base_unit_id
         LEFT JOIN product_categories c
           ON c.tenant_id = p.tenant_id
          AND c.id = p.category_id
         WHERE p.tenant_id = $1
           AND p.is_active
           AND (
             NOT p.variants_enabled
             OR NOT pv.is_default
             OR EXISTS (
               SELECT 1
               FROM inventory_movements visible_default
               WHERE visible_default.tenant_id = pv.tenant_id
                 AND visible_default.variant_id = pv.id
             )
           )
           AND (
             lower(p.name) LIKE '%' || lower($2) || '%'
             OR lower(COALESCE(pv.display_name, ''))
               LIKE '%' || lower($2) || '%'
             OR lower(COALESCE(pv.sku, ''))
               LIKE '%' || lower($2) || '%'
             OR lower(p.brand) LIKE '%' || lower($2) || '%'
             OR lower(COALESCE(c.name, ''))
               LIKE '%' || lower($2) || '%'
             OR lower(u.name) LIKE '%' || lower($2) || '%'
             OR lower(COALESCE(u.symbol, ''))
               LIKE '%' || lower($2) || '%'
             OR EXISTS (
               SELECT 1
               FROM product_barcodes matching_barcode
               WHERE matching_barcode.tenant_id = pv.tenant_id
                 AND matching_barcode.variant_id = pv.id
                 AND matching_barcode.is_active
                 AND lower(matching_barcode.barcode)
                   LIKE '%' || lower($2) || '%'
             )
           )
       )
       SELECT
         product_id,
         variant_id,
         product_name,
         variant_name,
         sku,
         primary_barcode,
         brand,
         category_name,
         unit_id,
         unit_name,
         unit_symbol,
         current_selling_price_paisa,
         available_own_base_qty,
         tracking_mode,
         allocation_policy,
         variants_enabled,
         configured_purchase_price_paisa
       FROM candidates
       ORDER BY
         search_rank ASC,
         CASE
           WHEN available_own_base_qty::numeric > 0 THEN 0
           ELSE 1
         END ASC,
         lower(product_name) ASC,
         lower(COALESCE(variant_name, '')) ASC,
         variant_id ASC
       LIMIT $3`,
      [tenantId, query, limit],
    )

    return result.rows.map((row) =>
      mapSearchResult(row, includeConfiguredPurchasePrice),
    )
  }

  async findVariantContext(
    tenantId: string,
    variantId: string,
  ): Promise<{
    productId: string
    configuredPurchasePricePaisa: string
    configuredSellingPricePaisa: string
  } | null> {
    const result = await this.db.query<{
      product_id: string
      configured_purchase_price_paisa: string
      configured_selling_price_paisa: string
    }>(
      `SELECT
         p.id AS product_id,
         pv.default_purchase_price_paisa::text
           AS configured_purchase_price_paisa,
         pv.default_selling_price_paisa::text
           AS configured_selling_price_paisa
       FROM product_variants pv
       JOIN products p
         ON p.tenant_id = pv.tenant_id
        AND p.id = pv.product_id
       WHERE pv.tenant_id = $1
         AND pv.id = $2
         AND pv.is_active
         AND p.is_active`,
      [tenantId, variantId],
    )

    const row = result.rows[0]
    return row
      ? {
          productId: row.product_id,
          configuredPurchasePricePaisa:
            row.configured_purchase_price_paisa,
          configuredSellingPricePaisa:
            row.configured_selling_price_paisa,
        }
      : null
  }
}
