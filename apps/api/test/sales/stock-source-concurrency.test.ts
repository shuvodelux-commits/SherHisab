import { randomUUID } from 'node:crypto'
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { InventoryReceiptService } from '../../src/modules/products/inventory-receipt.service'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { SalesService } from '../../src/modules/sales/sales.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function createFixture(name: string, openingQty: string) {
  const tenant = await createProductTestTenant(name)
  const owner = await new AuthService().createUser({
    tenantId: tenant.id,
    name: `${name} Owner`,
    email: `owner-${randomUUID()}@example.com`,
    password: 'strong-password-123',
    role: 'OWNER',
  })
  const products = new ProductMasterService(tenant.id, getPool())
  const unit = (await products.listUnits()).find(
    (candidate) => candidate.symbol === 'pcs',
  )
  if (!unit) {
    throw new Error('Default Piece unit not found')
  }

  const product = await products.createProduct(
    {
      name: `${name} Product`,
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '80',
      defaultSellingPricePaisa: '100',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    owner.id,
  )

  if (openingQty !== '0') {
    await new InventoryService(getPool()).adjustStock(
      tenant.id,
      owner.id,
      product.defaultVariantId,
      {
        deltaBaseQty: openingQty,
        note: 'Concurrency fixture',
        unitCostPaisa: '50',
        sellingPricePaisa: '100',
        businessDate: '2026-09-01',
      },
    )
  }

  return { tenant, owner, product }
}

function negativeSaleInput(variantId: string) {
  return {
    operationId: randomUUID(),
    businessDate: '2026-09-25',
    customer: {
      name: 'Concurrent Buyer',
      phone: '01710000000',
    },
    discountPaisa: '0',
    lines: [
      {
        variantId,
        baseQty: '5',
        shortageResolution: {
          type: 'NEGATIVE_STOCK' as const,
        },
      },
    ],
    payments: [
      {
        clientLineId: randomUUID(),
        method: 'CASH' as const,
        amountPaisa: '500',
      },
    ],
  }
}

describe.skipIf(!hasDatabase)('stock source concurrency', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('does not let concurrent Negative Stock sales consume the same physical quantity twice', async () => {
    const fixture = await createFixture(
      'Concurrent Negative Sales',
      '5',
    )
    const service = new SalesService(getPool())

    const [first, second] = await Promise.all([
      service.commitSale(
        fixture.tenant.id,
        fixture.owner.id,
        true,
        negativeSaleInput(fixture.product.defaultVariantId),
      ),
      service.commitSale(
        fixture.tenant.id,
        fixture.owner.id,
        true,
        negativeSaleInput(fixture.product.defaultVariantId),
      ),
    ])

    expect(first.grandTotalPaisa).toBe('500')
    expect(second.grandTotalPaisa).toBe('500')

    const physical = await getPool().query<{
      allocated: string
    }>(
      `SELECT trim_scale(
         COALESCE(SUM(base_qty), 0)
       )::text AS allocated
       FROM sales_line_lot_allocations
       WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(physical.rows[0]?.allocated).toBe('5')

    const shortfalls = await getPool().query<{
      original: string
      outstanding: string
    }>(
      `SELECT
         trim_scale(
           COALESCE(SUM(original_shortfall_base_qty), 0)
         )::text AS original,
         trim_scale(
           COALESCE(SUM(outstanding_base_qty), 0)
         )::text AS outstanding
       FROM inventory_shortfalls
       WHERE tenant_id = $1
         AND variant_id = $2`,
      [
        fixture.tenant.id,
        fixture.product.defaultVariantId,
      ],
    )
    expect(shortfalls.rows[0]).toEqual({
      original: '5',
      outstanding: '5',
    })

    const lot = await getPool().query<{
      remaining: string
    }>(
      `SELECT trim_scale(
         COALESCE(SUM(remaining_base_qty), 0)
       )::text AS remaining
       FROM inventory_lots
       WHERE tenant_id = $1
         AND variant_id = $2`,
      [
        fixture.tenant.id,
        fixture.product.defaultVariantId,
      ],
    )
    expect(lot.rows[0]?.remaining).toBe('0')

    const movementBalance = await getPool().query<{
      balance: string
    }>(
      `SELECT trim_scale(
         COALESCE(SUM(base_qty_delta), 0)
       )::text AS balance
       FROM inventory_movements
       WHERE tenant_id = $1
         AND variant_id = $2`,
      [
        fixture.tenant.id,
        fixture.product.defaultVariantId,
      ],
    )
    expect(movementBalance.rows[0]?.balance).toBe('-5')
  })

  it('does not let concurrent Purchase receipts reconcile the same shortfall twice', async () => {
    const fixture = await createFixture(
      'Concurrent Purchase Reconciliation',
      '0',
    )
    const sales = new SalesService(getPool())

    await sales.commitSale(
      fixture.tenant.id,
      fixture.owner.id,
      true,
      negativeSaleInput(fixture.product.defaultVariantId),
    )

    const receipt = new InventoryReceiptService(getPool())
    const [first, second] = await Promise.all([
      receipt.receivePurchase({
        tenantId: fixture.tenant.id,
        actorUserId: fixture.owner.id,
        variantId: fixture.product.defaultVariantId,
        businessDate: '2026-09-26',
        sourceReference: 'PUR-RACE-001',
        receivedBaseQty: '5',
        unitCostPaisa: '80',
        sellingPricePaisa: '110',
      }),
      receipt.receivePurchase({
        tenantId: fixture.tenant.id,
        actorUserId: fixture.owner.id,
        variantId: fixture.product.defaultVariantId,
        businessDate: '2026-09-26',
        sourceReference: 'PUR-RACE-002',
        receivedBaseQty: '5',
        unitCostPaisa: '80',
        sellingPricePaisa: '110',
      }),
    ])

    expect(
      [first.reconciledBaseQty, second.reconciledBaseQty].sort(),
    ).toEqual(['0', '5'])

    const reconciliation = await getPool().query<{
      reconciled: string
    }>(
      `SELECT trim_scale(
         COALESCE(SUM(reconciled_base_qty), 0)
       )::text AS reconciled
       FROM inventory_shortfall_reconciliations
       WHERE tenant_id = $1`,
      [fixture.tenant.id],
    )
    expect(reconciliation.rows[0]?.reconciled).toBe('5')

    const shortfall = await getPool().query<{
      outstanding: string
    }>(
      `SELECT trim_scale(
         COALESCE(SUM(outstanding_base_qty), 0)
       )::text AS outstanding
       FROM inventory_shortfalls
       WHERE tenant_id = $1
         AND variant_id = $2`,
      [
        fixture.tenant.id,
        fixture.product.defaultVariantId,
      ],
    )
    expect(shortfall.rows[0]?.outstanding).toBe('0')

    const lots = await getPool().query<{
      original: string
      remaining: string
    }>(
      `SELECT
         trim_scale(
           COALESCE(SUM(original_base_qty), 0)
         )::text AS original,
         trim_scale(
           COALESCE(SUM(remaining_base_qty), 0)
         )::text AS remaining
       FROM inventory_lots
       WHERE tenant_id = $1
         AND variant_id = $2
         AND source_type = 'PURCHASE'`,
      [
        fixture.tenant.id,
        fixture.product.defaultVariantId,
      ],
    )
    expect(lots.rows[0]).toEqual({
      original: '10',
      remaining: '5',
    })

    const movementBalance = await getPool().query<{
      balance: string
    }>(
      `SELECT trim_scale(
         COALESCE(SUM(base_qty_delta), 0)
       )::text AS balance
       FROM inventory_movements
       WHERE tenant_id = $1
         AND variant_id = $2`,
      [
        fixture.tenant.id,
        fixture.product.defaultVariantId,
      ],
    )
    expect(movementBalance.rows[0]?.balance).toBe('5')
  })
})
