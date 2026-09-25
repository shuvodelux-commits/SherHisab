import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { SalesPricingService } from '../../src/modules/sales/sales-pricing.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function createSalesFixture(name: string) {
  const tenant = await createProductTestTenant(name)
  const productService = new ProductMasterService(tenant.id, getPool())
  const unit = (await productService.listUnits()).find(
    (item) => item.symbol === 'pcs',
  )

  if (!unit) {
    throw new Error('Default Piece unit not found')
  }

  const owner = await new AuthService().createUser({
    tenantId: tenant.id,
    name: name + ' Owner',
    email: 'owner-' + randomUUID() + '@example.com',
    password: 'strong-password-123',
    role: 'OWNER',
  })

  const product = await productService.createProduct(
    {
      name: name + ' Product',
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '900',
      defaultSellingPricePaisa: '1400',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    owner.id,
  )

  return {
    tenant,
    owner,
    product,
    inventory: new InventoryService(getPool()),
    pricing: new SalesPricingService(getPool()),
  }
}

async function addLot(
  fixture: Awaited<ReturnType<typeof createSalesFixture>>,
  input: {
    qty: string
    unitCostPaisa: string
    sellingPricePaisa: string
    businessDate: string
  },
) {
  await fixture.inventory.adjustStock(
    fixture.tenant.id,
    fixture.owner.id,
    fixture.product.defaultVariantId,
    {
      deltaBaseQty: input.qty,
      note: 'Sales pricing fixture',
      unitCostPaisa: input.unitCostPaisa,
      sellingPricePaisa: input.sellingPricePaisa,
      businessDate: input.businessDate,
    },
  )
}

describe.skipIf(!hasDatabase)('FIFO sales pricing', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('quotes one FIFO lot without mutating inventory', async () => {
    const fixture = await createSalesFixture('Single Lot')
    await addLot(fixture, {
      qty: '2',
      unitCostPaisa: '1000',
      sellingPricePaisa: '1500',
      businessDate: '2026-01-01',
    })

    const quote = await fixture.pricing.quoteFifoLine(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
      '1',
    )

    expect(quote).toMatchObject({
      variantId: fixture.product.defaultVariantId,
      requestedBaseQty: '1',
      availableBaseQty: '2',
      automaticSalesTotalPaisa: '1500',
      effectiveUnitSellingPricePaisa: '1500',
      cogsPaisa: '1000',
      isSufficient: true,
    })
    expect(quote.allocations).toEqual([
      expect.objectContaining({
        baseQty: '1',
        unitCostPaisa: '1000',
        lotSellingPricePaisa: '1500',
        automaticSalesAmountPaisa: '1500',
        cogsAmountPaisa: '1000',
      }),
    ])

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.remainingBaseQty).toBe('2')
  })

  it('splits a quote across FIFO lots with different selling prices', async () => {
    const fixture = await createSalesFixture('Cross Lot')
    await addLot(fixture, {
      qty: '2',
      unitCostPaisa: '1000',
      sellingPricePaisa: '1500',
      businessDate: '2026-01-01',
    })
    await addLot(fixture, {
      qty: '2',
      unitCostPaisa: '1200',
      sellingPricePaisa: '1800',
      businessDate: '2026-02-01',
    })

    const quote = await fixture.pricing.quoteFifoLine(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
      '3',
    )

    expect(quote).toMatchObject({
      requestedBaseQty: '3',
      availableBaseQty: '4',
      automaticSalesTotalPaisa: '4800',
      effectiveUnitSellingPricePaisa: '1600',
      cogsPaisa: '3200',
      isSufficient: true,
    })
    expect(
      quote.allocations.map((allocation) => ({
        baseQty: allocation.baseQty,
        unitCostPaisa: allocation.unitCostPaisa,
        lotSellingPricePaisa: allocation.lotSellingPricePaisa,
      })),
    ).toEqual([
      {
        baseQty: '2',
        unitCostPaisa: '1000',
        lotSellingPricePaisa: '1500',
      },
      {
        baseQty: '1',
        unitCostPaisa: '1200',
        lotSellingPricePaisa: '1800',
      },
    ])
  })

  it('skips depleted lots and uses the next active FIFO lot', async () => {
    const fixture = await createSalesFixture('Depleted Lot')
    await addLot(fixture, {
      qty: '1',
      unitCostPaisa: '800',
      sellingPricePaisa: '1200',
      businessDate: '2026-01-01',
    })
    await addLot(fixture, {
      qty: '2',
      unitCostPaisa: '1000',
      sellingPricePaisa: '1600',
      businessDate: '2026-02-01',
    })

    await fixture.inventory.adjustStock(
      fixture.tenant.id,
      fixture.owner.id,
      fixture.product.defaultVariantId,
      {
        deltaBaseQty: '-1',
        note: 'Deplete first lot',
        businessDate: '2026-03-01',
      },
    )

    const quote = await fixture.pricing.quoteFifoLine(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
      '1',
    )

    expect(quote.allocations).toHaveLength(1)
    expect(quote.allocations[0]).toMatchObject({
      baseQty: '1',
      unitCostPaisa: '1000',
      lotSellingPricePaisa: '1600',
    })
  })

  it('rejects insufficient stock without changing lot quantities', async () => {
    const fixture = await createSalesFixture('Insufficient Sale')
    await addLot(fixture, {
      qty: '1.5',
      unitCostPaisa: '1000',
      sellingPricePaisa: '1500',
      businessDate: '2026-01-01',
    })

    await expect(
      fixture.pricing.quoteFifoLine(
        fixture.tenant.id,
        fixture.product.defaultVariantId,
        '2',
      ),
    ).rejects.toThrow('Insufficient stock')

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    expect(lots[0]?.remainingBaseQty).toBe('1.5')
  })

  it('uses an edited lot selling price for future quotes without changing COGS', async () => {
    const fixture = await createSalesFixture('Edited Lot Price')
    await addLot(fixture, {
      qty: '2',
      unitCostPaisa: '1000',
      sellingPricePaisa: '1500',
      businessDate: '2026-01-01',
    })

    const lots = await fixture.inventory.listLots(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
    )
    const lot = lots[0]
    if (!lot) {
      throw new Error('Expected a stock lot')
    }

    await fixture.inventory.updateLotSellingPrice(
      fixture.tenant.id,
      fixture.product.id,
      lot.id,
      '1750',
      fixture.owner.id,
    )

    const quote = await fixture.pricing.quoteFifoLine(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
      '2',
    )

    expect(quote).toMatchObject({
      automaticSalesTotalPaisa: '3500',
      effectiveUnitSellingPricePaisa: '1750',
      cogsPaisa: '2000',
    })
    expect(quote.allocations[0]).toMatchObject({
      lotSellingPricePaisa: '1750',
      unitCostPaisa: '1000',
    })
  })
})


describe.skipIf(!hasDatabase)('FEFO sales pricing', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('uses the earliest unexpired batch for BATCH_EXPIRY Products configured for FEFO', async () => {
    const fixture = await createSalesFixture('FEFO Pricing')

    await getPool().query(
      `UPDATE products
       SET tracking_mode = 'BATCH_EXPIRY',
           allocation_policy = 'FEFO'
       WHERE tenant_id = $1 AND id = $2`,
      [fixture.tenant.id, fixture.product.id],
    )

    const insertBatch = async (input: {
      receivedOn: string
      expiresOn: string
      batchCode: string
      unitCostPaisa: string
      sellingPricePaisa: string
    }) => {
      const result = await getPool().query<{ id: string }>(
        `INSERT INTO inventory_lots
         (
           tenant_id,
           variant_id,
           source_type,
           received_on,
           unit_cost_paisa,
           default_sell_price_paisa,
           original_base_qty,
           remaining_base_qty,
           batch_code,
           expires_on
         )
         VALUES ($1,$2,'ADJUSTMENT',$3,$4,$5,5,5,$6,$7)
         RETURNING id`,
        [
          fixture.tenant.id,
          fixture.product.defaultVariantId,
          input.receivedOn,
          input.unitCostPaisa,
          input.sellingPricePaisa,
          input.batchCode,
          input.expiresOn,
        ],
      )

      const id = result.rows[0]?.id
      if (!id) {
        throw new Error('Failed to create FEFO batch')
      }
      return id
    }

    await insertBatch({
      receivedOn: '2025-12-01',
      expiresOn: '2026-09-20',
      batchCode: 'EXPIRED',
      unitCostPaisa: '500',
      sellingPricePaisa: '900',
    })
    await insertBatch({
      receivedOn: '2026-01-01',
      expiresOn: '2027-01-01',
      batchCode: 'LATER-EXPIRY',
      unitCostPaisa: '700',
      sellingPricePaisa: '1100',
    })
    const earliestValid = await insertBatch({
      receivedOn: '2026-06-01',
      expiresOn: '2026-10-15',
      batchCode: 'EARLIER-EXPIRY',
      unitCostPaisa: '1300',
      sellingPricePaisa: '2000',
    })

    const quote = await fixture.pricing.quoteFifoLine(
      fixture.tenant.id,
      fixture.product.defaultVariantId,
      '1',
      '2026-09-24',
    )

    expect(quote).toMatchObject({
      availableBaseQty: '10',
      automaticSalesTotalPaisa: '2000',
      cogsPaisa: '1300',
    })
    expect(quote.allocations).toEqual([
      expect.objectContaining({
        lotId: earliestValid,
        baseQty: '1',
        unitCostPaisa: '1300',
        lotSellingPricePaisa: '2000',
      }),
    ])
  })
})
