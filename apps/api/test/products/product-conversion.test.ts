import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { ConversionService } from '../../src/modules/products/conversion.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from './product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function createConversionFixture(name: string) {
  const tenant = await createProductTestTenant(name)
  const owner = await new AuthService().createUser({
    tenantId: tenant.id,
    name: `${name} Owner`,
    email: `owner-${randomUUID()}@example.com`,
    password: 'strong-password-123',
    role: 'OWNER',
  })
  const products = new ProductMasterService(tenant.id, getPool())
  const gira = await products.createUnit({ name: 'Gira', symbol: 'gira' })
  const gauge = await products.createUnit({ name: 'Gauge', symbol: 'gauge' })
  const product = await products.createProduct(
    {
      name: `${name} Fabric`,
      baseUnitId: gira.id,
      defaultPurchasePricePaisa: '10000',
      defaultSellingPricePaisa: '30000',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    owner.id,
  )

  return {
    tenant,
    product,
    gira,
    gauge,
    conversion: new ConversionService(tenant.id, getPool()),
  }
}

describe.skipIf(!hasDatabase)('product conversion profiles', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('stores an exact compound Gauge/Gira profile and increments versions', async () => {
    const fixture = await createConversionFixture('Compound Conversion')

    const first = await fixture.conversion.replaceActiveProfile(
      fixture.product.id,
      {
        type: 'COMPOUND',
        baseUnitId: fixture.gira.id,
        pricingUnitId: fixture.gauge.id,
        pricingBaseFactorNumerator: '16',
        pricingBaseFactorDenominator: '1',
        displayPrecision: 2,
        components: [
          {
            key: 'gauge',
            label: 'Gauge',
            unitId: fixture.gauge.id,
            baseFactorNumerator: '16',
            baseFactorDenominator: '1',
            sortOrder: 0,
            minValue: '0',
            maxExclusive: null,
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
          {
            key: 'gira',
            label: 'Gira',
            unitId: fixture.gira.id,
            baseFactorNumerator: '1',
            baseFactorDenominator: '1',
            sortOrder: 1,
            minValue: '0',
            maxExclusive: '16',
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
        ],
      },
    )

    expect(first).toMatchObject({
      type: 'COMPOUND',
      version: 1,
      baseUnitId: fixture.gira.id,
      pricingUnitId: fixture.gauge.id,
      pricingBaseFactorNumerator: '16',
      pricingBaseFactorDenominator: '1',
      displayPrecision: 2,
      components: [
        {
          key: 'gauge',
          label: 'Gauge',
          unitId: fixture.gauge.id,
          baseFactorNumerator: '16',
          baseFactorDenominator: '1',
          sortOrder: 0,
          minValue: '0',
          maxExclusive: null,
          allowFraction: false,
          autoNormalizeRemainder: false,
        },
        {
          key: 'gira',
          label: 'Gira',
          unitId: fixture.gira.id,
          baseFactorNumerator: '1',
          baseFactorDenominator: '1',
          sortOrder: 1,
          minValue: '0',
          maxExclusive: '16',
          allowFraction: false,
          autoNormalizeRemainder: false,
        },
      ],
    })

    const second = await fixture.conversion.replaceActiveProfile(
      fixture.product.id,
      {
        ...first,
        id: undefined,
        version: undefined,
        components: first.components.map((component) => ({
          key: component.key,
          label: component.label,
          unitId: component.unitId,
          baseFactorNumerator: component.baseFactorNumerator,
          baseFactorDenominator: component.baseFactorDenominator,
          sortOrder: component.sortOrder,
          minValue: component.minValue,
          maxExclusive: component.maxExclusive,
          allowFraction: component.allowFraction,
          autoNormalizeRemainder: component.autoNormalizeRemainder,
        })),
      },
    )

    expect(second.version).toBe(2)

    const active = await fixture.conversion.getActiveProfile(
      fixture.product.id,
    )
    expect(active?.id).toBe(second.id)

    const firstVersion = await fixture.conversion.getProfileVersion(
      fixture.product.id,
      1,
    )
    expect(firstVersion?.id).toBe(first.id)
  })
})
