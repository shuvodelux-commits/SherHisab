import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import type {
  CreateProductInput,
  ReplaceVariantConfigurationInput,
} from '../../src/modules/products/product.types'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from './product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function createSimpleProduct(
  tenantName: string,
  productName: string,
  overrides: Partial<CreateProductInput> = {},
) {
  const tenant = await createProductTestTenant(tenantName)
  const service = new ProductMasterService(tenant.id, getPool())
  const unit = (await service.listUnits()).find((item) => item.symbol === 'pcs')

  if (!unit) {
    throw new Error('Default Piece unit not found')
  }

  const product = await service.createProduct(
    {
      name: productName,
      brand: '',
      categoryId: null,
      baseUnitId: unit.id,
      barcode: '',
      defaultPurchasePricePaisa: '1000',
      defaultSellingPricePaisa: '1500',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
      ...overrides,
    },
    null,
  )

  return { tenant, service, product, baseUnit: unit }
}

function colorSizeConfiguration(
  variants: ReplaceVariantConfigurationInput['variants'],
): ReplaceVariantConfigurationInput {
  return {
    enabled: true,
    options: [
      { name: 'Color', values: ['Red', 'Blue'] },
      { name: 'Size', values: ['M', 'L'] },
    ],
    variants,
  }
}

describe.skipIf(!hasDatabase)('advanced product configuration', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('stores fixed and variable alternative units while preserving the base unit', async () => {
    const { tenant, service, product, baseUnit } = await createSimpleProduct(
      'Alternative Unit Tenant',
      'Fabric Roll',
    )
    const box = await service.createUnit({ name: 'Box', symbol: 'box' })
    const roll = await service.createUnit({ name: 'Roll', symbol: 'roll' })

    await service.replaceAlternativeUnits(product.id, [
      {
        unitId: box.id,
        conversionMode: 'FIXED',
        conversionToBase: '20',
      },
      {
        unitId: roll.id,
        conversionMode: 'VARIABLE',
        conversionToBase: null,
      },
    ])

    const rows = await getPool().query<{
      unit_id: string
      conversion_mode: string
      conversion_to_base: string | null
    }>(
      `SELECT unit_id,
              conversion_mode,
              CASE
                WHEN conversion_to_base IS NULL THEN NULL
                ELSE trim_scale(conversion_to_base)::text
              END AS conversion_to_base
       FROM product_units
       WHERE tenant_id = $1
         AND product_id = $2
         AND is_active
       ORDER BY unit_id`,
      [tenant.id, product.id],
    )

    expect(rows.rows).toEqual(
      expect.arrayContaining([
        {
          unit_id: baseUnit.id,
          conversion_mode: 'FIXED',
          conversion_to_base: '1',
        },
        {
          unit_id: box.id,
          conversion_mode: 'FIXED',
          conversion_to_base: '20',
        },
        {
          unit_id: roll.id,
          conversion_mode: 'VARIABLE',
          conversion_to_base: null,
        },
      ]),
    )
    expect(rows.rows).toHaveLength(3)
  })

  it('rejects invalid fixed and variable conversions', async () => {
    const { service, product } = await createSimpleProduct(
      'Conversion Validation Tenant',
      'Cable',
    )
    const box = await service.createUnit({ name: 'Box' })
    const roll = await service.createUnit({ name: 'Roll' })

    await expect(
      service.replaceAlternativeUnits(product.id, [
        { unitId: box.id, conversionMode: 'FIXED', conversionToBase: '0' },
      ]),
    ).rejects.toThrow()

    await expect(
      service.replaceAlternativeUnits(product.id, [
        { unitId: box.id, conversionMode: 'FIXED', conversionToBase: '-2' },
      ]),
    ).rejects.toThrow()

    await expect(
      service.replaceAlternativeUnits(product.id, [
        { unitId: roll.id, conversionMode: 'VARIABLE', conversionToBase: '10' },
      ]),
    ).rejects.toThrow()
  })

  it('rejects alternative units from another tenant and rejects the base unit as an alternative', async () => {
    const a = await createSimpleProduct(
      'Alternative Tenant A',
      'Pipe',
    )
    const b = await createSimpleProduct(
      'Alternative Tenant B',
      'Foreign Product',
    )
    const foreign = await b.service.createUnit({ name: 'Foreign Unit' })

    await expect(
      a.service.replaceAlternativeUnits(a.product.id, [
        { unitId: foreign.id, conversionMode: 'FIXED', conversionToBase: '2' },
      ]),
    ).rejects.toThrow()

    await expect(
      a.service.replaceAlternativeUnits(a.product.id, [
        {
          unitId: a.baseUnit.id,
          conversionMode: 'FIXED',
          conversionToBase: '1',
        },
      ]),
    ).rejects.toThrow()
  })

  it('stores descriptive specifications without creating stock variants', async () => {
    const { tenant, service, product } = await createSimpleProduct(
      'Specification Tenant',
      'Ceiling Fan',
    )

    await service.replaceSpecifications(product.id, [
      { name: 'Watt', value: '80W' },
      { name: 'Warranty', value: '2 Years' },
    ])

    const specs = await getPool().query<{ name: string; value: string }>(
      `SELECT name, value
       FROM product_specifications
       WHERE tenant_id = $1 AND product_id = $2
       ORDER BY sort_order, id`,
      [tenant.id, product.id],
    )
    const variants = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM product_variants
       WHERE tenant_id = $1 AND product_id = $2 AND is_active`,
      [tenant.id, product.id],
    )

    expect(specs.rows).toEqual([
      { name: 'Watt', value: '80W' },
      { name: 'Warranty', value: '2 Years' },
    ])
    expect(variants.rows[0]?.count).toBe('1')
  })

  it('enables Color and Size variants with option mappings', async () => {
    const { tenant, service, product } = await createSimpleProduct(
      'Variant Tenant',
      'T-Shirt',
    )

    await service.replaceVariantConfiguration(
      product.id,
      colorSizeConfiguration([
        {
          displayName: 'Red / M',
          sku: 'TS-RED-M',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '2',
          selections: { Color: 'Red', Size: 'M' },
        },
        {
          displayName: 'Blue / L',
          sku: 'TS-BLUE-L',
          defaultPurchasePricePaisa: '1100',
          defaultSellingPricePaisa: '1600',
          minimumStockBaseQty: '3',
          selections: { Color: 'Blue', Size: 'L' },
        },
      ]),
    )

    const state = await getPool().query<{ variants_enabled: boolean }>(
      `SELECT variants_enabled
       FROM products
       WHERE tenant_id = $1 AND id = $2`,
      [tenant.id, product.id],
    )
    const variants = await getPool().query<{ id: string; sku: string | null }>(
      `SELECT id, sku
       FROM product_variants
       WHERE tenant_id = $1
         AND product_id = $2
         AND NOT is_default
         AND is_active
       ORDER BY sku`,
      [tenant.id, product.id],
    )
    const mappings = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM product_variant_option_values pvv
       JOIN product_variants pv
         ON pv.tenant_id = pvv.tenant_id
        AND pv.id = pvv.variant_id
       WHERE pv.tenant_id = $1
         AND pv.product_id = $2
         AND pv.is_active
         AND NOT pv.is_default`,
      [tenant.id, product.id],
    )

    expect(state.rows[0]?.variants_enabled).toBe(true)
    expect(variants.rows.map((row) => row.sku)).toEqual([
      'TS-BLUE-L',
      'TS-RED-M',
    ])
    expect(mappings.rows[0]?.count).toBe('4')
  })

  it('excludes the hidden default Variant from the user-facing Variant count', async () => {
    const { service, product } = await createSimpleProduct(
      'Visible Variant Count Tenant',
      'Counted T-Shirt',
    )

    await service.replaceVariantConfiguration(
      product.id,
      colorSizeConfiguration([
        {
          displayName: 'Red / M',
          sku: 'COUNT-RED-M',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red', Size: 'M' },
        },
        {
          displayName: 'Blue / L',
          sku: 'COUNT-BLUE-L',
          defaultPurchasePricePaisa: '1100',
          defaultSellingPricePaisa: '1600',
          minimumStockBaseQty: '0',
          selections: { Color: 'Blue', Size: 'L' },
        },
      ]),
    )

    const current = await service.getProduct(product.id)
    expect(current.variantsEnabled).toBe(true)
    expect(current.variantCount).toBe(2)
  })

  it('rejects generic opening stock when a new Product enables variants', async () => {
    const tenant = await createProductTestTenant('Variant Opening Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const unit = (await service.listUnits()).find((item) => item.symbol === 'pcs')

    if (!unit) {
      throw new Error('Default Piece unit not found')
    }

    await expect(
      service.createProduct(
        {
          name: 'Variant Product With Opening',
          baseUnitId: unit.id,
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          openingStockBaseQty: '5',
          minimumStockBaseQty: '0',
          trackingMode: 'SIMPLE',
          advanced: {
            variantConfiguration: colorSizeConfiguration([
              {
                displayName: 'Red / M',
                sku: 'OPEN-RED-M',
                defaultPurchasePricePaisa: '1000',
                defaultSellingPricePaisa: '1500',
                minimumStockBaseQty: '0',
                selections: { Color: 'Red', Size: 'M' },
              },
            ]),
          },
        },
        null,
      ),
    ).rejects.toThrow(/opening stock/i)

    const count = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM products
       WHERE tenant_id = $1 AND name = 'Variant Product With Opening'`,
      [tenant.id],
    )
    expect(count.rows[0]?.count).toBe('0')
  })

  it('rejects duplicate option names, option values and variant combinations case-insensitively', async () => {
    const { service, product } = await createSimpleProduct(
      'Variant Duplicate Tenant',
      'Shirt',
    )

    await expect(
      service.replaceVariantConfiguration(product.id, {
        enabled: true,
        options: [
          { name: 'Color', values: ['Red'] },
          { name: ' color ', values: ['Blue'] },
        ],
        variants: [],
      }),
    ).rejects.toThrow()

    await expect(
      service.replaceVariantConfiguration(product.id, {
        enabled: true,
        options: [{ name: 'Color', values: ['Red', ' red '] }],
        variants: [],
      }),
    ).rejects.toThrow()

    await expect(
      service.replaceVariantConfiguration(
        product.id,
        colorSizeConfiguration([
          {
            displayName: 'First',
            sku: 'COMBO-1',
            defaultPurchasePricePaisa: '1000',
            defaultSellingPricePaisa: '1500',
            minimumStockBaseQty: '0',
            selections: { Color: 'Red', Size: 'M' },
          },
          {
            displayName: 'Second',
            sku: 'COMBO-2',
            defaultPurchasePricePaisa: '1000',
            defaultSellingPricePaisa: '1500',
            minimumStockBaseQty: '0',
            selections: { color: 'red', size: 'm' },
          },
        ]),
      ),
    ).rejects.toThrow()
  })

  it('rejects duplicate active SKU across Products in the same tenant', async () => {
    const tenant = await createProductTestTenant('SKU Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const unit = (await service.listUnits()).find((item) => item.symbol === 'pcs')

    if (!unit) {
      throw new Error('Default Piece unit not found')
    }

    const first = await service.createProduct(
      {
        name: 'First Variant Product',
        baseUnitId: unit.id,
        defaultPurchasePricePaisa: '100',
        defaultSellingPricePaisa: '200',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      null,
    )
    const second = await service.createProduct(
      {
        name: 'Second Variant Product',
        baseUnitId: unit.id,
        defaultPurchasePricePaisa: '100',
        defaultSellingPricePaisa: '200',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      null,
    )

    const variantConfig: ReplaceVariantConfigurationInput = {
      enabled: true,
      options: [{ name: 'Color', values: ['Red'] }],
      variants: [
        {
          displayName: 'Red',
          sku: 'GLOBAL-SKU',
          defaultPurchasePricePaisa: '100',
          defaultSellingPricePaisa: '200',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red' },
        },
      ],
    }

    await service.replaceVariantConfiguration(first.id, variantConfig)
    await expect(
      service.replaceVariantConfiguration(second.id, variantConfig),
    ).rejects.toThrow()
  })

  it('archives no-history variants when disabling and preserves the default variant', async () => {
    const { tenant, service, product } = await createSimpleProduct(
      'Disable Variant Tenant',
      'Dress',
    )

    await service.replaceVariantConfiguration(product.id, {
      enabled: true,
      options: [{ name: 'Color', values: ['Red'] }],
      variants: [
        {
          displayName: 'Red',
          sku: 'DRESS-RED',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red' },
        },
      ],
    })

    await service.replaceVariantConfiguration(product.id, {
      enabled: false,
      options: [],
      variants: [],
    })

    const productRow = await getPool().query<{ variants_enabled: boolean }>(
      `SELECT variants_enabled
       FROM products WHERE tenant_id = $1 AND id = $2`,
      [tenant.id, product.id],
    )
    const variants = await getPool().query<{
      is_default: boolean
      is_active: boolean
    }>(
      `SELECT is_default, is_active
       FROM product_variants
       WHERE tenant_id = $1 AND product_id = $2
       ORDER BY is_default DESC`,
      [tenant.id, product.id],
    )

    expect(productRow.rows[0]?.variants_enabled).toBe(false)
    expect(variants.rows).toEqual(
      expect.arrayContaining([
        { is_default: true, is_active: true },
        { is_default: false, is_active: false },
      ]),
    )
  })

  it('rejects disabling a Variant when inventory history is created concurrently', async () => {
    const { tenant, service, product } = await createSimpleProduct(
      'Concurrent Variant History Tenant',
      'Concurrent Garment',
    )

    await service.replaceVariantConfiguration(product.id, {
      enabled: true,
      options: [{ name: 'Color', values: ['Red'] }],
      variants: [
        {
          displayName: 'Red',
          sku: 'CONCURRENT-RED',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red' },
        },
      ],
    })

    const advanced = await service.getAdvancedConfiguration(product.id)
    const variantId = advanced.variants.find((variant) => variant.isActive)?.id

    if (!variantId) {
      throw new Error('Expected active Variant')
    }

    const blocker = await getPool().connect()
    const adjustmentClient = await getPool().connect()
    const configurationClient = await getPool().connect()

    async function waitForLockWait(pid: number): Promise<void> {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const state = await getPool().query<{ wait_event_type: string | null }>(
          `SELECT wait_event_type
           FROM pg_stat_activity
           WHERE pid = $1`,
          [pid],
        )

        if (state.rows[0]?.wait_event_type === 'Lock') {
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      throw new Error(`Backend ${pid} did not enter a lock wait`)
    }

    try {
      await blocker.query('BEGIN')
      await blocker.query(
        `SELECT id
         FROM product_variants
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenant.id, variantId],
      )

      const adjustmentPid = (
        await adjustmentClient.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        )
      ).rows[0]!.pid
      const configurationPid = (
        await configurationClient.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        )
      ).rows[0]!.pid

      const inventory = new InventoryService(adjustmentClient)
      const configurationService = new ProductMasterService(
        tenant.id,
        configurationClient,
      )

      const adjustmentPromise = inventory.adjustStock(
        tenant.id,
        null,
        variantId,
        {
          deltaBaseQty: '1',
          note: 'Concurrent Variant stock',
          unitCostPaisa: '1000',
        },
      )
      await waitForLockWait(adjustmentPid)

      const disablePromise = configurationService.replaceVariantConfiguration(
        product.id,
        {
          enabled: false,
          options: [],
          variants: [],
        },
      )
      await waitForLockWait(configurationPid)

      await blocker.query('COMMIT')
      await adjustmentPromise

      await expect(disablePromise).rejects.toThrow(/history|stock/i)

      const current = await service.getProduct(product.id)
      const currentAdvanced = await service.getAdvancedConfiguration(product.id)
      expect(current.variantsEnabled).toBe(true)
      expect(
        currentAdvanced.variants.find((variant) => variant.id === variantId)
          ?.isActive,
      ).toBe(true)
      expect(current.stockBaseQty).toBe('1')
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined)
      blocker.release()
      adjustmentClient.release()
      configurationClient.release()
    }
  })

  it('rejects disabling or changing the option combination of a Variant with inventory history', async () => {
    const { tenant, service, product } = await createSimpleProduct(
      'History Variant Tenant',
      'Garment',
    )

    await service.replaceVariantConfiguration(
      product.id,
      colorSizeConfiguration([
        {
          displayName: 'Red / M',
          sku: 'GAR-RED-M',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red', Size: 'M' },
        },
      ]),
    )

    const variant = await getPool().query<{ id: string }>(
      `SELECT id
       FROM product_variants
       WHERE tenant_id = $1
         AND product_id = $2
         AND NOT is_default
         AND is_active`,
      [tenant.id, product.id],
    )
    const variantId = variant.rows[0]!.id
    await new InventoryService(getPool()).adjustStock(
      tenant.id,
      null,
      variantId,
      {
        deltaBaseQty: '1',
        note: 'Initial variant stock',
        unitCostPaisa: '1000',
      },
    )

    await expect(
      service.replaceVariantConfiguration(product.id, {
        enabled: false,
        options: [],
        variants: [],
      }),
    ).rejects.toThrow(/history|stock/i)

    await expect(
      service.replaceVariantConfiguration(
        product.id,
        colorSizeConfiguration([
          {
            id: variantId,
            displayName: 'Blue / M',
            sku: 'GAR-RED-M',
            defaultPurchasePricePaisa: '1000',
            defaultSellingPricePaisa: '1500',
            minimumStockBaseQty: '0',
            selections: { Color: 'Blue', Size: 'M' },
          },
        ]),
      ),
    ).rejects.toThrow(/history|combination/i)
  })

  it('rejects a Variant id owned by another tenant', async () => {
    const a = await createSimpleProduct('Variant Ref Tenant A', 'A Product')
    const b = await createSimpleProduct('Variant Ref Tenant B', 'B Product')

    await b.service.replaceVariantConfiguration(b.product.id, {
      enabled: true,
      options: [{ name: 'Color', values: ['Red'] }],
      variants: [
        {
          displayName: 'Red',
          sku: 'FOREIGN-RED',
          defaultPurchasePricePaisa: '1000',
          defaultSellingPricePaisa: '1500',
          minimumStockBaseQty: '0',
          selections: { Color: 'Red' },
        },
      ],
    })

    const foreignVariant = await getPool().query<{ id: string }>(
      `SELECT id
       FROM product_variants
       WHERE tenant_id = $1
         AND product_id = $2
         AND NOT is_default
         AND is_active`,
      [b.tenant.id, b.product.id],
    )

    await expect(
      a.service.replaceVariantConfiguration(a.product.id, {
        enabled: true,
        options: [{ name: 'Color', values: ['Red'] }],
        variants: [
          {
            id: foreignVariant.rows[0]!.id,
            displayName: 'Red',
            sku: 'TRY-FOREIGN',
            defaultPurchasePricePaisa: '1000',
            defaultSellingPricePaisa: '1500',
            minimumStockBaseQty: '0',
            selections: { Color: 'Red' },
          },
        ],
      }),
    ).rejects.toThrow()
  })
})
