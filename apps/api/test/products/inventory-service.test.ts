import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from './product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function createProduct(options: {
  tenantName: string
  productName: string
  purchasePricePaisa?: string
  openingStock?: string
}) {
  const tenant = await createProductTestTenant(options.tenantName)
  const productService = new ProductMasterService(tenant.id, getPool())
  const unit = (await productService.listUnits()).find(
    (item) => item.symbol === 'pcs',
  )

  if (!unit) {
    throw new Error('Default Piece unit not found')
  }

  const product = await productService.createProduct(
    {
      name: options.productName,
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: options.purchasePricePaisa ?? '1000',
      defaultSellingPricePaisa: '1500',
      openingStockBaseQty: options.openingStock ?? '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    null,
  )

  return { tenant, product }
}

describe.skipIf(!hasDatabase)('inventory stock adjustments', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('adds an exact decimal adjustment as a new cost lot and movement', async () => {
    const { tenant, product } = await createProduct({
      tenantName: 'Positive Adjustment Tenant',
      productName: 'Fabric',
    })
    const service = new InventoryService(getPool())

    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '0.125',
      note: 'Opening recount',
      unitCostPaisa: '1234',
      businessDate: '2026-01-15',
    })

    const lots = await getPool().query<{
      qty: string
      remaining: string
      cost: string
      source: string
      received_on: string
    }>(
      `SELECT trim_scale(original_base_qty)::text AS qty,
              trim_scale(remaining_base_qty)::text AS remaining,
              unit_cost_paisa::text AS cost,
              source_type AS source,
              received_on::text
       FROM inventory_lots
       WHERE tenant_id = $1 AND variant_id = $2
       ORDER BY received_on, id`,
      [tenant.id, product.defaultVariantId],
    )
    const movements = await getPool().query<{
      delta: string
      balance: string
      note: string
      type: string
    }>(
      `SELECT trim_scale(base_qty_delta)::text AS delta,
              trim_scale(balance_after_base_qty)::text AS balance,
              note,
              movement_type AS type
       FROM inventory_movements
       WHERE tenant_id = $1 AND variant_id = $2
       ORDER BY created_at, id`,
      [tenant.id, product.defaultVariantId],
    )

    expect(lots.rows).toEqual([
      {
        qty: '0.125',
        remaining: '0.125',
        cost: '1234',
        source: 'ADJUSTMENT',
        received_on: '2026-01-15',
      },
    ])
    expect(movements.rows).toEqual([
      {
        delta: '0.125',
        balance: '0.125',
        note: 'Opening recount',
        type: 'ADJUSTMENT_IN',
      },
    ])
  })

  it('uses the explicit adjustment cost when supplied', async () => {
    const { tenant, product } = await createProduct({
      tenantName: 'Explicit Cost Tenant',
      productName: 'Battery',
      purchasePricePaisa: '1000',
    })
    const service = new InventoryService(getPool())

    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '2',
      note: 'Different cost',
      unitCostPaisa: '1775',
    })

    const row = await getPool().query<{ cost: string }>(
      `SELECT unit_cost_paisa::text AS cost
       FROM inventory_lots
       WHERE tenant_id = $1 AND variant_id = $2`,
      [tenant.id, product.defaultVariantId],
    )
    expect(row.rows[0]?.cost).toBe('1775')
  })

  it('falls back to the Variant default purchase price for positive stock', async () => {
    const { tenant, product } = await createProduct({
      tenantName: 'Fallback Cost Tenant',
      productName: 'Switch',
      purchasePricePaisa: '900',
    })
    const service = new InventoryService(getPool())

    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '1',
      note: 'Use default cost',
    })

    const row = await getPool().query<{ cost: string }>(
      `SELECT unit_cost_paisa::text AS cost
       FROM inventory_lots
       WHERE tenant_id = $1 AND variant_id = $2`,
      [tenant.id, product.defaultVariantId],
    )
    expect(row.rows[0]?.cost).toBe('900')
  })

  it('rejects positive stock when explicit and default costs are both zero', async () => {
    const { tenant, product } = await createProduct({
      tenantName: 'Missing Cost Tenant',
      productName: 'Free Config Product',
      purchasePricePaisa: '0',
    })
    const service = new InventoryService(getPool())

    await expect(
      service.adjustStock(tenant.id, null, product.defaultVariantId, {
        deltaBaseQty: '1',
        note: 'Missing cost',
      }),
    ).rejects.toThrow('Purchase price')

    const movements = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM inventory_movements
       WHERE tenant_id = $1 AND variant_id = $2`,
      [tenant.id, product.defaultVariantId],
    )
    expect(movements.rows[0]?.count).toBe('0')
  })

  it('consumes FIFO lots exactly across multiple business dates', async () => {
    const { tenant, product } = await createProduct({
      tenantName: 'FIFO Tenant',
      productName: 'Pipe',
    })
    const service = new InventoryService(getPool())

    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '2',
      note: 'Older stock',
      unitCostPaisa: '100',
      businessDate: '2026-01-01',
    })
    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '2',
      note: 'Newer stock',
      unitCostPaisa: '200',
      businessDate: '2026-02-01',
    })
    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '-2.5',
      note: 'Damage',
      businessDate: '2026-03-01',
    })

    const lots = await getPool().query<{
      cost: string
      remaining: string
      status: string
    }>(
      `SELECT unit_cost_paisa::text AS cost,
              trim_scale(remaining_base_qty)::text AS remaining,
              status
       FROM inventory_lots
       WHERE tenant_id = $1 AND variant_id = $2
       ORDER BY received_on, id`,
      [tenant.id, product.defaultVariantId],
    )
    expect(lots.rows).toEqual([
      { cost: '100', remaining: '0', status: 'DEPLETED' },
      { cost: '200', remaining: '1.5', status: 'ACTIVE' },
    ])

    const outMovement = await getPool().query<{
      id: string
      delta: string
      balance: string
      note: string
    }>(
      `SELECT id,
              trim_scale(base_qty_delta)::text AS delta,
              trim_scale(balance_after_base_qty)::text AS balance,
              note
       FROM inventory_movements
       WHERE tenant_id = $1
         AND variant_id = $2
         AND movement_type = 'ADJUSTMENT_OUT'`,
      [tenant.id, product.defaultVariantId],
    )
    expect(outMovement.rows[0]).toMatchObject({
      delta: '-2.5',
      balance: '1.5',
      note: 'Damage',
    })

    const allocations = await getPool().query<{
      cost: string
      qty: string
    }>(
      `SELECT unit_cost_paisa::text AS cost,
              trim_scale(base_qty)::text AS qty
       FROM inventory_movement_lot_allocations
       WHERE tenant_id = $1 AND movement_id = $2
       ORDER BY unit_cost_paisa`,
      [tenant.id, outMovement.rows[0]!.id],
    )
    expect(allocations.rows).toEqual([
      { cost: '100', qty: '2' },
      { cost: '200', qty: '0.5' },
    ])

    const balance = await getPool().query<{ balance: string }>(
      `SELECT trim_scale(COALESCE(SUM(base_qty_delta), 0))::text AS balance
       FROM inventory_movements
       WHERE tenant_id = $1 AND variant_id = $2`,
      [tenant.id, product.defaultVariantId],
    )
    const lotBalance = await getPool().query<{ balance: string }>(
      `SELECT trim_scale(COALESCE(SUM(remaining_base_qty), 0))::text AS balance
       FROM inventory_lots
       WHERE tenant_id = $1 AND variant_id = $2`,
      [tenant.id, product.defaultVariantId],
    )
    expect(balance.rows[0]?.balance).toBe('1.5')
    expect(lotBalance.rows[0]?.balance).toBe('1.5')
  })

  it('rejects removing more than available stock without partial writes', async () => {
    const { tenant, product } = await createProduct({
      tenantName: 'Insufficient Tenant',
      productName: 'Socket',
      openingStock: '2',
    })
    const service = new InventoryService(getPool())
    const before = await getPool().query<{ movements: string; lots: string }>(
      `SELECT
         (SELECT COUNT(*) FROM inventory_movements WHERE tenant_id = $1 AND variant_id = $2)::text AS movements,
         (SELECT COUNT(*) FROM inventory_lots WHERE tenant_id = $1 AND variant_id = $2)::text AS lots`,
      [tenant.id, product.defaultVariantId],
    )

    await expect(
      service.adjustStock(tenant.id, null, product.defaultVariantId, {
        deltaBaseQty: '-3',
        note: 'Impossible recount',
      }),
    ).rejects.toThrow('insufficient')

    const after = await getPool().query<{
      movements: string
      lots: string
      balance: string
    }>(
      `SELECT
         (SELECT COUNT(*) FROM inventory_movements WHERE tenant_id = $1 AND variant_id = $2)::text AS movements,
         (SELECT COUNT(*) FROM inventory_lots WHERE tenant_id = $1 AND variant_id = $2)::text AS lots,
         (SELECT trim_scale(COALESCE(SUM(base_qty_delta), 0))::text
            FROM inventory_movements WHERE tenant_id = $1 AND variant_id = $2) AS balance`,
      [tenant.id, product.defaultVariantId],
    )

    expect(after.rows[0]?.movements).toBe(before.rows[0]?.movements)
    expect(after.rows[0]?.lots).toBe(before.rows[0]?.lots)
    expect(after.rows[0]?.balance).toBe('2')
  })

  it('orders FIFO by business date even when the older lot is inserted later', async () => {
    const { tenant, product } = await createProduct({
      tenantName: 'Backdated FIFO Tenant',
      productName: 'Wire',
    })
    const service = new InventoryService(getPool())

    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '1',
      note: 'Inserted first',
      unitCostPaisa: '200',
      businessDate: '2026-02-01',
    })
    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '1',
      note: 'Backdated older',
      unitCostPaisa: '100',
      businessDate: '2026-01-01',
    })
    await service.adjustStock(tenant.id, null, product.defaultVariantId, {
      deltaBaseQty: '-1',
      note: 'Consume oldest',
      businessDate: '2026-03-01',
    })

    const lots = await getPool().query<{ cost: string; remaining: string }>(
      `SELECT unit_cost_paisa::text AS cost,
              trim_scale(remaining_base_qty)::text AS remaining
       FROM inventory_lots
       WHERE tenant_id = $1 AND variant_id = $2
       ORDER BY received_on, id`,
      [tenant.id, product.defaultVariantId],
    )

    expect(lots.rows).toEqual([
      { cost: '100', remaining: '0' },
      { cost: '200', remaining: '1' },
    ])
  })

  it('serializes concurrent removals so the same stock cannot be consumed twice', async () => {
    const { tenant, product } = await createProduct({
      tenantName: 'Concurrent Adjustment Tenant',
      productName: 'Steel Rod',
      openingStock: '5',
    })
    const clientA = await getPool().connect()
    const clientB = await getPool().connect()

    try {
      const serviceA = new InventoryService(clientA)
      const serviceB = new InventoryService(clientB)
      const results = await Promise.allSettled([
        serviceA.adjustStock(tenant.id, null, product.defaultVariantId, {
          deltaBaseQty: '-4',
          note: 'Concurrent A',
        }),
        serviceB.adjustStock(tenant.id, null, product.defaultVariantId, {
          deltaBaseQty: '-4',
          note: 'Concurrent B',
        }),
      ])

      expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1)

      const balance = await getPool().query<{ balance: string }>(
        `SELECT trim_scale(COALESCE(SUM(base_qty_delta), 0))::text AS balance
         FROM inventory_movements
         WHERE tenant_id = $1 AND variant_id = $2`,
        [tenant.id, product.defaultVariantId],
      )
      const negativeLots = await getPool().query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM inventory_lots
         WHERE tenant_id = $1
           AND variant_id = $2
           AND remaining_base_qty < 0`,
        [tenant.id, product.defaultVariantId],
      )

      expect(balance.rows[0]?.balance).toBe('1')
      expect(negativeLots.rows[0]?.count).toBe('0')
    } finally {
      clientA.release()
      clientB.release()
    }
  })
})
