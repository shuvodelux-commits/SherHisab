import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { PosService } from '../../src/modules/pos/pos.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function createSearchFixture(name: string) {
  const tenant = await createProductTestTenant(name)
  const products = new ProductMasterService(tenant.id, getPool())
  const unit = (await products.listUnits()).find(
    (candidate) => candidate.symbol === 'pcs',
  )

  if (!unit) {
    throw new Error('Default Piece unit not found')
  }
  const unitId = unit.id

  async function createProduct(input: {
    name: string
    brand?: string
    sku?: string
    barcode?: string
    stock?: string
  }) {
    const product = await products.createProduct(
      {
        name: input.name,
        brand: input.brand ?? '',
        baseUnitId: unitId,
        defaultPurchasePricePaisa: '1000',
        defaultSellingPricePaisa: '1500',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      null,
    )

    if (input.sku !== undefined) {
      await getPool().query(
        `UPDATE product_variants
         SET sku = $3
         WHERE tenant_id = $1 AND id = $2`,
        [tenant.id, product.defaultVariantId, input.sku],
      )
    }

    if (input.barcode !== undefined) {
      await getPool().query(
        `INSERT INTO product_barcodes
         (tenant_id, variant_id, barcode, is_primary)
         VALUES ($1,$2,$3,TRUE)`,
        [tenant.id, product.defaultVariantId, input.barcode],
      )
    }

    if (input.stock !== undefined && input.stock !== '0') {
      await getPool().query(
        `INSERT INTO inventory_movements
         (
           tenant_id,
           variant_id,
           movement_type,
           business_date,
           base_qty_delta,
           balance_after_base_qty,
           reference_type,
           note
         )
         VALUES ($1,$2,$3,'2026-09-25',$4,$4,'POS_SEARCH_FIXTURE','')`,
        [
          tenant.id,
          product.defaultVariantId,
          Number(input.stock) > 0 ? 'ADJUSTMENT_IN' : 'SALE',
          input.stock,
        ],
      )
    }

    return product
  }

  return { tenant, products, unit, createProduct }
}

describe.skipIf(!hasDatabase)('POS Product search', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('ranks exact barcode, exact SKU, exact name, prefix, word-prefix and substring in that order', async () => {
    const fixture = await createSearchFixture('POS Search Ranking')
    const query = 'needle'

    const barcode = await fixture.createProduct({
      name: 'Barcode Product',
      barcode: query,
      stock: '0',
    })
    const sku = await fixture.createProduct({
      name: 'SKU Product',
      sku: query,
      stock: '-2',
    })
    const exactName = await fixture.createProduct({
      name: 'Needle',
      stock: '3',
    })
    const prefix = await fixture.createProduct({
      name: 'Needle Pipe',
      stock: '1',
    })
    const wordPrefix = await fixture.createProduct({
      name: 'Heavy Needlework Pipe',
      stock: '5',
    })
    const substring = await fixture.createProduct({
      name: 'PreNeedleAfter',
      stock: '4',
    })

    const results = await new PosService(
      fixture.tenant.id,
      getPool(),
    ).searchProducts(query, { limit: 10 })

    expect(
      results.map((item) => item.productId),
    ).toEqual([
      barcode.id,
      sku.id,
      exactName.id,
      prefix.id,
      wordPrefix.id,
      substring.id,
    ])

    expect(results[0]).toMatchObject({
      productId: barcode.id,
      variantId: barcode.defaultVariantId,
      primaryBarcode: query,
      availableOwnBaseQty: '0',
    })
    expect(results[1]).toMatchObject({
      productId: sku.id,
      variantId: sku.defaultVariantId,
      sku: query,
      availableOwnBaseQty: '-2',
    })
  })

  it('uses only a small in-stock tie-break inside the same rank', async () => {
    const fixture = await createSearchFixture('POS Search Stock Tie')
    const query = 'hammer'

    const zero = await fixture.createProduct({
      name: 'Hammer Zero',
      stock: '0',
    })
    const positive = await fixture.createProduct({
      name: 'Hammer Positive',
      stock: '2',
    })

    const results = await new PosService(
      fixture.tenant.id,
      getPool(),
    ).searchProducts(query, { limit: 10 })

    expect(results.map((item) => item.productId)).toEqual([
      positive.id,
      zero.id,
    ])
  })

  it('is tenant-scoped, bounded, and exact barcode resolves the stock-bearing Variant', async () => {
    const a = await createSearchFixture('POS Search Tenant A')
    const b = await createSearchFixture('POS Search Tenant B')

    const direct = await a.createProduct({
      name: 'Scanned Product',
      barcode: 'SCAN-001',
    })
    await b.createProduct({
      name: 'Foreign Scanned Product',
      barcode: 'SCAN-001',
    })

    for (let index = 0; index < 8; index += 1) {
      await a.createProduct({
        name: `Bounded Search ${index}`,
      })
    }

    const service = new PosService(a.tenant.id, getPool())
    const scanned = await service.searchProducts('SCAN-001', {
      limit: 5,
    })
    const bounded = await service.searchProducts('Bounded', {
      limit: 3,
    })

    expect(scanned).toHaveLength(1)
    expect(scanned[0]).toMatchObject({
      productId: direct.id,
      variantId: direct.defaultVariantId,
      primaryBarcode: 'SCAN-001',
    })
    expect(bounded).toHaveLength(3)
    expect(
      bounded.every((item) => item.productName.startsWith('Bounded')),
    ).toBe(true)
  })

  it('matches variant display name, brand, category and unit without loading the full catalog', async () => {
    const fixture = await createSearchFixture('POS Search Fields')
    const category = await fixture.products.createCategory('Electrical')
    const product = await fixture.products.createProduct(
      {
        name: 'Switch Product',
        brand: 'VoltMaster',
        categoryId: category.id,
        baseUnitId: fixture.unit.id,
        defaultPurchasePricePaisa: '1000',
        defaultSellingPricePaisa: '1500',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      null,
    )
    await getPool().query(
      `UPDATE product_variants
       SET display_name = 'Industrial Blue'
       WHERE tenant_id = $1 AND id = $2`,
      [fixture.tenant.id, product.defaultVariantId],
    )

    const service = new PosService(fixture.tenant.id, getPool())

    await expect(
      service.searchProducts('Industrial', { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({ productId: product.id }),
    ])
    await expect(
      service.searchProducts('VoltMaster', { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({ productId: product.id }),
    ])
    await expect(
      service.searchProducts('Electrical', { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({ productId: product.id }),
    ])
    await expect(
      service.searchProducts('Piece', { limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({ productId: product.id }),
    ])
  })

  it('rejects unbounded or empty searches instead of returning the catalog', async () => {
    const fixture = await createSearchFixture('POS Search Guard')
    const service = new PosService(fixture.tenant.id, getPool())

    await expect(
      service.searchProducts('', { limit: 10 }),
    ).resolves.toEqual([])
    await expect(
      service.searchProducts('x', { limit: 0 }),
    ).rejects.toThrow('POS search limit must be between 1 and 50')
    await expect(
      service.searchProducts('x', { limit: 51 }),
    ).rejects.toThrow('POS search limit must be between 1 and 50')
  })
})
