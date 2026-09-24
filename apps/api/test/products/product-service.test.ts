import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import type {
  CreateProductInput,
  UpdateProductInput,
} from '../../src/modules/products/product.types'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from './product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function pieceUnitId(service: ProductMasterService): Promise<string> {
  const unit = (await service.listUnits()).find((item) => item.symbol === 'pcs')

  if (!unit) {
    throw new Error('Default Piece unit not found')
  }

  return unit.id
}

function productInput(
  name: string,
  baseUnitId: string,
  overrides: Partial<CreateProductInput> = {},
): CreateProductInput {
  return {
    name,
    brand: '',
    categoryId: null,
    baseUnitId,
    barcode: '',
    defaultPurchasePricePaisa: '1000',
    defaultSellingPricePaisa: '1500',
    openingStockBaseQty: '0',
    minimumStockBaseQty: '0',
    trackingMode: 'SIMPLE',
    ...overrides,
  }
}

function updateInput(
  product: Awaited<ReturnType<ProductMasterService['getProduct']>>,
  overrides: Partial<UpdateProductInput> = {},
): UpdateProductInput {
  return {
    name: product.name,
    brand: product.brand,
    categoryId: product.category?.id ?? null,
    baseUnitId: product.baseUnit.id,
    barcode: product.primaryBarcode ?? '',
    defaultPurchasePricePaisa: product.defaultPurchasePricePaisa,
    defaultSellingPricePaisa: product.defaultSellingPricePaisa,
    minimumStockBaseQty: product.minimumStockBaseQty,
    trackingMode: product.trackingMode,
    ...overrides,
  }
}

describe.skipIf(!hasDatabase)('product master lifecycle', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('creates a simple product with one default variant and base unit mapping', async () => {
    const tenant = await createProductTestTenant('Simple Product Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)

    const product = await service.createProduct(
      productInput('Hammer', baseUnitId),
      null,
    )

    const variants = await getPool().query<{
      id: string
      is_default: boolean
    }>(
      `SELECT id, is_default
       FROM product_variants
       WHERE tenant_id = $1 AND product_id = $2`,
      [tenant.id, product.id],
    )
    const productUnits = await getPool().query<{
      unit_id: string
      conversion_mode: string
      conversion_to_base: string
    }>(
      `SELECT unit_id, conversion_mode, trim_scale(conversion_to_base)::text AS conversion_to_base
       FROM product_units
       WHERE tenant_id = $1 AND product_id = $2 AND is_active`,
      [tenant.id, product.id],
    )

    expect(variants.rows).toHaveLength(1)
    expect(variants.rows[0]?.is_default).toBe(true)
    expect(productUnits.rows).toEqual([
      {
        unit_id: baseUnitId,
        conversion_mode: 'FIXED',
        conversion_to_base: '1',
      },
    ])
  })

  it('creates exact opening inventory evidence without a cash-session dependency', async () => {
    const tenant = await createProductTestTenant('Opening Stock Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)

    const product = await service.createProduct(
      productInput('Fabric', baseUnitId, {
        defaultPurchasePricePaisa: '1250',
        openingStockBaseQty: '2.5',
      }),
      null,
    )

    const lot = await getPool().query<{
      qty: string
      cost: string
      source_type: string
    }>(
      `SELECT trim_scale(original_base_qty)::text AS qty,
              unit_cost_paisa::text AS cost,
              source_type
       FROM inventory_lots
       WHERE tenant_id = $1 AND variant_id = $2`,
      [tenant.id, product.defaultVariantId],
    )
    const movement = await getPool().query<{
      delta: string
      balance: string
      movement_type: string
    }>(
      `SELECT trim_scale(base_qty_delta)::text AS delta,
              trim_scale(balance_after_base_qty)::text AS balance,
              movement_type
       FROM inventory_movements
       WHERE tenant_id = $1 AND variant_id = $2`,
      [tenant.id, product.defaultVariantId],
    )
    const allocations = await getPool().query<{ qty: string }>(
      `SELECT trim_scale(a.base_qty)::text AS qty
       FROM inventory_movement_lot_allocations a
       JOIN inventory_movements m
         ON m.tenant_id = a.tenant_id AND m.id = a.movement_id
       WHERE a.tenant_id = $1 AND m.variant_id = $2`,
      [tenant.id, product.defaultVariantId],
    )

    expect(product.stockBaseQty).toBe('2.5')
    expect(lot.rows).toEqual([
      { qty: '2.5', cost: '1250', source_type: 'OPENING' },
    ])
    expect(movement.rows).toEqual([
      { delta: '2.5', balance: '2.5', movement_type: 'OPENING' },
    ])
    expect(allocations.rows).toEqual([{ qty: '2.5' }])
  })

  it('rejects positive opening stock with zero purchase cost before persisting', async () => {
    const tenant = await createProductTestTenant('Opening Validation Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)

    await expect(
      service.createProduct(
        productInput('Invalid Opening Product', baseUnitId, {
          defaultPurchasePricePaisa: '0',
          openingStockBaseQty: '1',
        }),
        null,
      ),
    ).rejects.toThrow('Purchase price must be greater than zero')

    const count = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM products
       WHERE tenant_id = $1 AND name = 'Invalid Opening Product'`,
      [tenant.id],
    )
    expect(count.rows[0]?.count).toBe('0')
  })

  it('rejects category and base unit references from another tenant', async () => {
    const tenantA = await createProductTestTenant('Reference Tenant A')
    const tenantB = await createProductTestTenant('Reference Tenant B')
    const serviceA = new ProductMasterService(tenantA.id, getPool())
    const serviceB = new ProductMasterService(tenantB.id, getPool())
    const unitA = await pieceUnitId(serviceA)
    const unitB = await pieceUnitId(serviceB)
    const categoryB = await serviceB.createCategory('Foreign Category')

    await expect(
      serviceA.createProduct(
        productInput('Foreign Category Product', unitA, {
          categoryId: categoryB.id,
        }),
        null,
      ),
    ).rejects.toThrow()

    await expect(
      serviceA.createProduct(
        productInput('Foreign Unit Product', unitB),
        null,
      ),
    ).rejects.toThrow()
  })

  it('enforces active product-name uniqueness per tenant only', async () => {
    const tenantA = await createProductTestTenant('Name Tenant A')
    const tenantB = await createProductTestTenant('Name Tenant B')
    const serviceA = new ProductMasterService(tenantA.id, getPool())
    const serviceB = new ProductMasterService(tenantB.id, getPool())
    const unitA = await pieceUnitId(serviceA)
    const unitB = await pieceUnitId(serviceB)

    await serviceA.createProduct(productInput('Battery', unitA), null)

    await expect(
      serviceA.createProduct(productInput(' battery ', unitA), null),
    ).rejects.toThrow()

    await expect(
      serviceB.createProduct(productInput('Battery', unitB), null),
    ).resolves.toMatchObject({ name: 'Battery' })
  })

  it('allows an archived product name to be recreated', async () => {
    const tenant = await createProductTestTenant('Archive Product Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)
    const original = await service.createProduct(
      productInput('Switch', baseUnitId),
      null,
    )

    await service.setProductActive(original.id, false)
    const replacement = await service.createProduct(
      productInput('switch', baseUnitId),
      null,
    )

    expect(replacement.id).not.toBe(original.id)
    expect(replacement.isActive).toBe(true)
  })

  it('lists only the trusted tenant and honors search, category, brand, status, limit and offset', async () => {
    const tenantA = await createProductTestTenant('List Tenant A')
    const tenantB = await createProductTestTenant('List Tenant B')
    const serviceA = new ProductMasterService(tenantA.id, getPool())
    const serviceB = new ProductMasterService(tenantB.id, getPool())
    const unitA = await pieceUnitId(serviceA)
    const unitB = await pieceUnitId(serviceB)
    const category = await serviceA.createCategory('Electrical')

    const first = await serviceA.createProduct(
      productInput('LED Bulb', unitA, {
        brand: 'Bright',
        categoryId: category.id,
      }),
      null,
    )
    await serviceA.createProduct(
      productInput('LED Tube', unitA, {
        brand: 'Bright',
        categoryId: category.id,
      }),
      null,
    )
    const inactive = await serviceA.createProduct(
      productInput('Old LED', unitA, {
        brand: 'Bright',
        categoryId: category.id,
      }),
      null,
    )
    await serviceA.setProductActive(inactive.id, false)
    await serviceB.createProduct(
      productInput('LED Foreign', unitB, { brand: 'Bright' }),
      null,
    )

    const page = await serviceA.listProducts({
      search: 'LED',
      categoryId: category.id,
      brand: 'Bright',
      status: 'active',
      limit: 1,
      offset: 0,
    })

    expect(page.total).toBe(2)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.id).toBe(first.id)
    expect(page.items.every((item) => item.name !== 'LED Foreign')).toBe(true)

    const secondPage = await serviceA.listProducts({
      search: 'LED',
      categoryId: category.id,
      brand: 'Bright',
      status: 'active',
      limit: 1,
      offset: 1,
    })
    expect(secondPage.items).toHaveLength(1)

    const inactivePage = await serviceA.listProducts({
      status: 'inactive',
      limit: 50,
      offset: 0,
    })
    expect(inactivePage.items.map((item) => item.id)).toContain(inactive.id)
  })

  it('does not allow Product Edit to silently change stock', async () => {
    const tenant = await createProductTestTenant('Edit Stock Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)
    const created = await service.createProduct(
      productInput('Pipe', baseUnitId, {
        openingStockBaseQty: '2',
      }),
      null,
    )
    const before = await service.getProduct(created.id)

    const payload = {
      ...updateInput(before, { brand: 'Updated Brand' }),
      openingStockBaseQty: '99',
    } as UpdateProductInput & { openingStockBaseQty: string }

    const updated = await service.updateProduct(created.id, payload)

    expect(updated.brand).toBe('Updated Brand')
    expect(updated.stockBaseQty).toBe('2')
  })

  it('allows retaining archived current masters but rejects newly assigning inactive masters', async () => {
    const tenant = await createProductTestTenant('Archived Reference Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    await pieceUnitId(service)
    const category = await service.createCategory('Current Category')
    const customUnit = await service.createUnit({ name: 'Meter', symbol: 'm' })
    const product = await service.createProduct(
      productInput('Wire', customUnit.id, { categoryId: category.id }),
      null,
    )

    await service.setCategoryActive(category.id, false)
    await service.setUnitActive(customUnit.id, false)

    const retained = await service.updateProduct(
      product.id,
      updateInput(await service.getProduct(product.id), {
        brand: 'Still Valid',
      }),
    )
    expect(retained.brand).toBe('Still Valid')

    const inactiveCategory = await service.createCategory('Old Category')
    await service.setCategoryActive(inactiveCategory.id, false)
    await expect(
      service.updateProduct(
        product.id,
        updateInput(await service.getProduct(product.id), {
          categoryId: inactiveCategory.id,
        }),
      ),
    ).rejects.toThrow()

    const inactiveUnit = await service.createUnit({ name: 'Old Unit' })
    await service.setUnitActive(inactiveUnit.id, false)
    await expect(
      service.updateProduct(
        product.id,
        updateInput(await service.getProduct(product.id), {
          baseUnitId: inactiveUnit.id,
        }),
      ),
    ).rejects.toThrow()
  })

  it('allows base-unit change before inventory history exists', async () => {
    const tenant = await createProductTestTenant('Base Unit Change Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)
    const meter = await service.createUnit({ name: 'Meter', symbol: 'm' })
    const product = await service.createProduct(
      productInput('Cable', baseUnitId),
      null,
    )

    const updated = await service.updateProduct(
      product.id,
      updateInput(await service.getProduct(product.id), {
        baseUnitId: meter.id,
      }),
    )

    expect(updated.baseUnit.id).toBe(meter.id)
    const mappings = await getPool().query<{ unit_id: string }>(
      `SELECT unit_id
       FROM product_units
       WHERE tenant_id = $1 AND product_id = $2 AND is_active`,
      [tenant.id, product.id],
    )
    expect(mappings.rows).toEqual([{ unit_id: meter.id }])
  })

  it('rejects base-unit change after inventory history exists', async () => {
    const tenant = await createProductTestTenant('Base Unit Locked Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)
    const meter = await service.createUnit({ name: 'Meter', symbol: 'm' })
    const product = await service.createProduct(
      productInput('Stocked Cable', baseUnitId, {
        openingStockBaseQty: '1',
      }),
      null,
    )

    await expect(
      service.updateProduct(
        product.id,
        updateInput(await service.getProduct(product.id), {
          baseUnitId: meter.id,
        }),
      ),
    ).rejects.toThrow('Base unit cannot be changed after inventory history exists')
  })

  it('rejects a base-unit change when inventory history is created concurrently', async () => {
    const tenant = await createProductTestTenant('Concurrent Base Unit Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)
    const meter = await service.createUnit({ name: 'Meter', symbol: 'm' })
    const product = await service.createProduct(
      productInput('Concurrent Cable', baseUnitId),
      null,
    )
    const blocker = await getPool().connect()
    const adjustmentClient = await getPool().connect()
    const updateClient = await getPool().connect()

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
        [tenant.id, product.defaultVariantId],
      )

      const adjustmentPid = Number(
        (await adjustmentClient.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid,
      )
      const updatePid = Number(
        (await updateClient.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid,
      )
      const inventory = new InventoryService(adjustmentClient)
      const updatingService = new ProductMasterService(tenant.id, updateClient)

      const adjustmentPromise = inventory.adjustStock(
        tenant.id,
        null,
        product.defaultVariantId,
        {
          deltaBaseQty: '1',
          note: 'Concurrent stock arrives',
          unitCostPaisa: '1000',
          sellingPricePaisa: '1500',
        },
      )
      await waitForLockWait(adjustmentPid)

      const updatePromise = updatingService.updateProduct(
        product.id,
        updateInput(product, { baseUnitId: meter.id }),
      )
      await waitForLockWait(updatePid)

      await blocker.query('COMMIT')
      await adjustmentPromise

      await expect(updatePromise).rejects.toThrow(
        'Base unit cannot be changed after inventory history exists',
      )

      const current = await service.getProduct(product.id)
      expect(current.baseUnit.id).toBe(baseUnitId)
      expect(current.stockBaseQty).toBe('1')
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined)
      blocker.release()
      adjustmentClient.release()
      updateClient.release()
    }
  })

  it('rolls back Product, Variant and Unit mapping when a duplicate barcode fails', async () => {
    const tenant = await createProductTestTenant('Barcode Rollback Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const baseUnitId = await pieceUnitId(service)

    await service.createProduct(
      productInput('Existing Barcode Product', baseUnitId, {
        barcode: '123456789',
      }),
      null,
    )

    const before = await getPool().query<{
      products: string
      variants: string
      units: string
      lots: string
      movements: string
    }>(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE tenant_id = $1)::text AS products,
         (SELECT COUNT(*) FROM product_variants WHERE tenant_id = $1)::text AS variants,
         (SELECT COUNT(*) FROM product_units WHERE tenant_id = $1)::text AS units,
         (SELECT COUNT(*) FROM inventory_lots WHERE tenant_id = $1)::text AS lots,
         (SELECT COUNT(*) FROM inventory_movements WHERE tenant_id = $1)::text AS movements`,
      [tenant.id],
    )

    await expect(
      service.createProduct(
        productInput('Must Roll Back', baseUnitId, {
          barcode: '123456789',
          openingStockBaseQty: '3',
        }),
        null,
      ),
    ).rejects.toThrow()

    const after = await getPool().query<{
      products: string
      variants: string
      units: string
      lots: string
      movements: string
    }>(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE tenant_id = $1)::text AS products,
         (SELECT COUNT(*) FROM product_variants WHERE tenant_id = $1)::text AS variants,
         (SELECT COUNT(*) FROM product_units WHERE tenant_id = $1)::text AS units,
         (SELECT COUNT(*) FROM inventory_lots WHERE tenant_id = $1)::text AS lots,
         (SELECT COUNT(*) FROM inventory_movements WHERE tenant_id = $1)::text AS movements`,
      [tenant.id],
    )

    expect(after.rows[0]).toEqual(before.rows[0])
  })
})
