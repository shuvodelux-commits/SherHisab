import type { DatabaseClient } from '../../db/request-database'
import type {
  ConversionComponentInput,
  ConversionComponentSnapshot,
  ConversionProfileInput,
  ConversionProfileSnapshot,
  ConversionProfileType,
} from './conversion.types'

interface ProfileRow {
  id: string
  product_id: string
  profile_type: ConversionProfileType
  version: number
  base_unit_id: string
  pricing_unit_id: string
  pricing_base_factor_numerator: string
  pricing_base_factor_denominator: string
  display_precision: number
}

interface ComponentRow {
  id: string
  component_key: string
  label: string
  unit_id: string
  base_factor_numerator: string
  base_factor_denominator: string
  sort_order: number
  min_value: string
  max_exclusive: string | null
  allow_fraction: boolean
  auto_normalize_remainder: boolean
}

function mapComponent(
  row: ComponentRow,
): ConversionComponentSnapshot {
  return {
    id: row.id,
    key: row.component_key,
    label: row.label,
    unitId: row.unit_id,
    baseFactorNumerator: row.base_factor_numerator,
    baseFactorDenominator: row.base_factor_denominator,
    sortOrder: row.sort_order,
    minValue: row.min_value,
    maxExclusive: row.max_exclusive,
    allowFraction: row.allow_fraction,
    autoNormalizeRemainder: row.auto_normalize_remainder,
  }
}

export class ConversionRepository {
  constructor(private readonly db: DatabaseClient) {}

  async lockProduct(
    tenantId: string,
    productId: string,
  ): Promise<{ id: string; baseUnitId: string } | null> {
    const result = await this.db.query<{
      id: string
      base_unit_id: string
    }>(
      `SELECT id, base_unit_id
       FROM products
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, productId],
    )
    const row = result.rows[0]

    return row
      ? { id: row.id, baseUnitId: row.base_unit_id }
      : null
  }

  async unitIsActive(
    tenantId: string,
    unitId: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ active: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM units
         WHERE tenant_id = $1
           AND id = $2
           AND is_active
       ) AS active`,
      [tenantId, unitId],
    )

    return result.rows[0]?.active ?? false
  }

  async nextVersion(
    tenantId: string,
    productId: string,
  ): Promise<number> {
    const result = await this.db.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0)::int + 1 AS version
       FROM product_conversion_profiles
       WHERE tenant_id = $1 AND product_id = $2`,
      [tenantId, productId],
    )

    return result.rows[0]?.version ?? 1
  }

  async deactivateActiveProfile(
    tenantId: string,
    productId: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE product_conversion_profiles
       SET is_active = FALSE
       WHERE tenant_id = $1
         AND product_id = $2
         AND is_active`,
      [tenantId, productId],
    )
  }

  async insertProfile(input: {
    tenantId: string
    productId: string
    version: number
    profile: ConversionProfileInput
  }): Promise<{ id: string }> {
    const profile = input.profile
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO product_conversion_profiles
       (
         tenant_id,
         product_id,
         profile_type,
         version,
         base_unit_id,
         pricing_unit_id,
         pricing_base_factor_numerator,
         pricing_base_factor_denominator,
         display_precision
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        input.tenantId,
        input.productId,
        profile.type,
        input.version,
        profile.baseUnitId,
        profile.pricingUnitId,
        profile.pricingBaseFactorNumerator,
        profile.pricingBaseFactorDenominator,
        profile.displayPrecision,
      ],
    )
    const row = result.rows[0]

    if (!row) {
      throw new Error('Failed to create conversion profile')
    }

    return row
  }

  async insertComponent(input: {
    tenantId: string
    profileId: string
    component: ConversionComponentInput
  }): Promise<void> {
    const component = input.component

    await this.db.query(
      `INSERT INTO product_conversion_components
       (
         tenant_id,
         profile_id,
         component_key,
         label,
         unit_id,
         base_factor_numerator,
         base_factor_denominator,
         sort_order,
         min_value,
         max_exclusive,
         allow_fraction,
         auto_normalize_remainder
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        input.tenantId,
        input.profileId,
        component.key,
        component.label,
        component.unitId,
        component.baseFactorNumerator,
        component.baseFactorDenominator,
        component.sortOrder,
        component.minValue,
        component.maxExclusive ?? null,
        component.allowFraction,
        component.autoNormalizeRemainder,
      ],
    )
  }

  async findActiveProfile(
    tenantId: string,
    productId: string,
  ): Promise<ConversionProfileSnapshot | null> {
    const profile = await this.findProfileRow(
      tenantId,
      productId,
      null,
      true,
    )

    return profile
      ? this.loadSnapshot(tenantId, profile)
      : null
  }

  async findProfileVersion(
    tenantId: string,
    productId: string,
    version: number,
  ): Promise<ConversionProfileSnapshot | null> {
    const profile = await this.findProfileRow(
      tenantId,
      productId,
      version,
      false,
    )

    return profile
      ? this.loadSnapshot(tenantId, profile)
      : null
  }

  private async findProfileRow(
    tenantId: string,
    productId: string,
    version: number | null,
    activeOnly: boolean,
  ): Promise<ProfileRow | null> {
    const result = await this.db.query<ProfileRow>(
      `SELECT
         id,
         product_id,
         profile_type,
         version,
         base_unit_id,
         pricing_unit_id,
         pricing_base_factor_numerator::text,
         pricing_base_factor_denominator::text,
         display_precision
       FROM product_conversion_profiles
       WHERE tenant_id = $1
         AND product_id = $2
         AND ($3::int IS NULL OR version = $3)
         AND (NOT $4::boolean OR is_active)
       ORDER BY version DESC
       LIMIT 1`,
      [tenantId, productId, version, activeOnly],
    )

    return result.rows[0] ?? null
  }

  private async loadSnapshot(
    tenantId: string,
    profile: ProfileRow,
  ): Promise<ConversionProfileSnapshot> {
    const components = await this.db.query<ComponentRow>(
      `SELECT
         id,
         component_key,
         label,
         unit_id,
         base_factor_numerator::text,
         base_factor_denominator::text,
         sort_order,
         trim_scale(min_value)::text AS min_value,
         CASE
           WHEN max_exclusive IS NULL THEN NULL
           ELSE trim_scale(max_exclusive)::text
         END AS max_exclusive,
         allow_fraction,
         auto_normalize_remainder
       FROM product_conversion_components
       WHERE tenant_id = $1 AND profile_id = $2
       ORDER BY sort_order, id`,
      [tenantId, profile.id],
    )

    return {
      id: profile.id,
      productId: profile.product_id,
      type: profile.profile_type,
      version: profile.version,
      baseUnitId: profile.base_unit_id,
      pricingUnitId: profile.pricing_unit_id,
      pricingBaseFactorNumerator:
        profile.pricing_base_factor_numerator,
      pricingBaseFactorDenominator:
        profile.pricing_base_factor_denominator,
      displayPrecision: profile.display_precision,
      components: components.rows.map(mapComponent),
    }
  }
}
