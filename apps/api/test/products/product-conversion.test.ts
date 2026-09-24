import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { ConversionService } from '../../src/modules/products/conversion.service'
import type {
  ConversionProfileInput,
  ConversionProfileSnapshot,
} from '../../src/modules/products/conversion.types'
import { ProductValidationError } from '../../src/modules/products/product.errors'
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
    owner,
    products,
    product,
    gira,
    gauge,
    conversion: new ConversionService(tenant.id, getPool()),
  }
}

function fabricProfileInput(
  fixture: Awaited<ReturnType<typeof createConversionFixture>>,
  overrides: Partial<ConversionProfileInput> = {},
): ConversionProfileInput {
  return {
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
    ...overrides,
  }
}

async function replaceFabricProfile(
  fixture: Awaited<ReturnType<typeof createConversionFixture>>,
  overrides: Partial<ConversionProfileInput> = {},
): Promise<ConversionProfileSnapshot> {
  return fixture.conversion.replaceActiveProfile(
    fixture.product.id,
    fabricProfileInput(fixture, overrides),
  )
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

    const first = await replaceFabricProfile(fixture)

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

    const second = await replaceFabricProfile(fixture)

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

  it('normalizes Fabric components to exact base and pricing quantities', async () => {
    const fixture = await createConversionFixture('Fabric Normalize')
    const profile = await replaceFabricProfile(fixture)

    const quantity = await fixture.conversion.normalize({
      kind: 'COMPONENTS',
      profileId: profile.id,
      profileVersion: profile.version,
      components: {
        gauge: '2',
        gira: '5',
      },
    })

    expect(quantity).toMatchObject({
      baseQty: '37',
      pricingQty: '2.3125',
      displayQty: '2.31',
      components: {
        gauge: '2',
        gira: '5',
      },
    })
    expect(quantity.snapshot?.id).toBe(profile.id)
    expect(quantity.snapshot?.version).toBe(1)
  })

  it('normalizes Pipe/Feet and generic Carton/Piece profiles from configuration', async () => {
    const fixture = await createConversionFixture('Generic Normalize')
    const feet = await fixture.products.createUnit({
      name: 'Foot',
      symbol: 'ft',
    })
    const pipe = await fixture.products.createUnit({
      name: 'Pipe',
      symbol: 'pipe',
    })
    const pipeProduct = await fixture.products.createProduct(
      {
        name: 'Configured Pipe',
        baseUnitId: feet.id,
        defaultPurchasePricePaisa: '5000',
        defaultSellingPricePaisa: '10000',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      fixture.owner.id,
    )
    const pipeProfile = await fixture.conversion.replaceActiveProfile(
      pipeProduct.id,
      {
        type: 'COMPOUND',
        baseUnitId: feet.id,
        pricingUnitId: pipe.id,
        pricingBaseFactorNumerator: '20',
        pricingBaseFactorDenominator: '1',
        displayPrecision: 4,
        components: [
          {
            key: 'pipe',
            label: 'Pipe',
            unitId: pipe.id,
            baseFactorNumerator: '20',
            baseFactorDenominator: '1',
            sortOrder: 0,
            minValue: '0',
            maxExclusive: null,
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
          {
            key: 'feet',
            label: 'Feet',
            unitId: feet.id,
            baseFactorNumerator: '1',
            baseFactorDenominator: '1',
            sortOrder: 1,
            minValue: '0',
            maxExclusive: '20',
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
        ],
      },
    )

    await expect(
      fixture.conversion.normalize({
        kind: 'COMPONENTS',
        profileId: pipeProfile.id,
        profileVersion: pipeProfile.version,
        components: { pipe: '1', feet: '5' },
      }),
    ).resolves.toMatchObject({
      baseQty: '25',
      pricingQty: '1.25',
      displayQty: '1.25',
    })

    const piece = await fixture.products.createUnit({
      name: 'Carton Piece',
      symbol: 'pc',
    })
    const carton = await fixture.products.createUnit({
      name: 'Carton',
      symbol: 'ctn',
    })
    const cartonProduct = await fixture.products.createProduct(
      {
        name: 'Configured Carton',
        baseUnitId: piece.id,
        defaultPurchasePricePaisa: '100',
        defaultSellingPricePaisa: '200',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      fixture.owner.id,
    )
    const cartonProfile = await fixture.conversion.replaceActiveProfile(
      cartonProduct.id,
      {
        type: 'PACK',
        baseUnitId: piece.id,
        pricingUnitId: carton.id,
        pricingBaseFactorNumerator: '10',
        pricingBaseFactorDenominator: '1',
        displayPrecision: 2,
        components: [
          {
            key: 'carton',
            label: 'Carton',
            unitId: carton.id,
            baseFactorNumerator: '10',
            baseFactorDenominator: '1',
            sortOrder: 0,
            minValue: '0',
            maxExclusive: null,
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
          {
            key: 'piece',
            label: 'Piece',
            unitId: piece.id,
            baseFactorNumerator: '1',
            baseFactorDenominator: '1',
            sortOrder: 1,
            minValue: '0',
            maxExclusive: '10',
            allowFraction: false,
            autoNormalizeRemainder: false,
          },
        ],
      },
    )

    await expect(
      fixture.conversion.normalize({
        kind: 'COMPONENTS',
        profileId: cartonProfile.id,
        profileVersion: cartonProfile.version,
        components: { carton: '3', piece: '4' },
      }),
    ).resolves.toMatchObject({
      baseQty: '34',
      pricingQty: '3.4',
      displayQty: '3.4',
    })
  })

  it('rejects invalid component quantities and only normalizes overflow when configured', async () => {
    const fixture = await createConversionFixture('Conversion Validation')
    const strictProfile = await replaceFabricProfile(fixture)

    await expect(
      fixture.conversion.normalize({
        kind: 'COMPONENTS',
        profileId: strictProfile.id,
        profileVersion: strictProfile.version,
        components: { gauge: '0', gira: '0' },
      }),
    ).rejects.toThrow('Normalized quantity must be greater than zero')

    await expect(
      fixture.conversion.normalize({
        kind: 'COMPONENTS',
        profileId: strictProfile.id,
        profileVersion: strictProfile.version,
        components: { gauge: '1', gira: '-1' },
      }),
    ).rejects.toThrow('cannot be negative')

    await expect(
      fixture.conversion.normalize({
        kind: 'COMPONENTS',
        profileId: strictProfile.id,
        profileVersion: strictProfile.version,
        components: { gauge: '1', gira: '16' },
      }),
    ).rejects.toThrow('must be less than 16')

    const normalizedProfile = await replaceFabricProfile(fixture, {
      components: fabricProfileInput(fixture).components.map((component) =>
        component.key === 'gira'
          ? {
              ...component,
              autoNormalizeRemainder: true,
            }
          : component,
      ),
    })

    const normalized = await fixture.conversion.normalize({
      kind: 'COMPONENTS',
      profileId: normalizedProfile.id,
      profileVersion: normalizedProfile.version,
      components: { gauge: '1', gira: '18' },
    })

    expect(normalized).toMatchObject({
      baseQty: '34',
      pricingQty: '2.125',
      displayQty: '2.13',
      components: { gauge: '2', gira: '2' },
    })
  })

  it('normalizes simple decimal quantity without floating-point drift', async () => {
    const fixture = await createConversionFixture('Simple Quantity')

    await expect(
      fixture.conversion.normalize({
        kind: 'SIMPLE',
        baseQty: '0.1',
      }),
    ).resolves.toEqual({
      baseQty: '0.1',
      pricingQty: '0.1',
      displayQty: '0.1',
      components: {},
      snapshot: null,
    })

    await expect(
      fixture.conversion.normalize({
        kind: 'SIMPLE',
        baseQty: '0',
      }),
    ).rejects.toBeInstanceOf(ProductValidationError)
  })

  it('persists Product conversion configuration without replacing legacy alternative units', async () => {
    const tenant = await createProductTestTenant('Product Conversion Integration')
    const owner = await new AuthService().createUser({
      tenantId: tenant.id,
      name: 'Product Conversion Owner',
      email: `owner-${randomUUID()}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })
    const products = new ProductMasterService(tenant.id, getPool())
    const gira = await products.createUnit({ name: 'Integration Gira', symbol: 'igira' })
    const gauge = await products.createUnit({ name: 'Integration Gauge', symbol: 'igauge' })

    const conversionProfile: ConversionProfileInput = {
      type: 'COMPOUND',
      baseUnitId: gira.id,
      pricingUnitId: gauge.id,
      pricingBaseFactorNumerator: '16',
      pricingBaseFactorDenominator: '1',
      displayPrecision: 2,
      components: [
        {
          key: 'gauge',
          label: 'Gauge',
          unitId: gauge.id,
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
          unitId: gira.id,
          baseFactorNumerator: '1',
          baseFactorDenominator: '1',
          sortOrder: 1,
          minValue: '0',
          maxExclusive: '16',
          allowFraction: false,
          autoNormalizeRemainder: false,
        },
      ],
    }

    const product = await products.createProduct(
      {
        name: 'Integrated Fabric',
        baseUnitId: gira.id,
        defaultPurchasePricePaisa: '10000',
        defaultSellingPricePaisa: '30000',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
        advanced: {
          alternativeUnits: [
            {
              unitId: gauge.id,
              conversionMode: 'FIXED',
              conversionToBase: '16',
            },
          ],
          conversionProfile,
        },
      },
      owner.id,
    )

    const first = await products.getAdvancedConfiguration(product.id)
    expect(first.alternativeUnits).toEqual([
      expect.objectContaining({
        unit: expect.objectContaining({ id: gauge.id }),
        conversionMode: 'FIXED',
        conversionToBase: '16',
      }),
    ])
    expect(first.conversionProfile).toMatchObject({
      type: 'COMPOUND',
      version: 1,
      baseUnitId: gira.id,
      pricingUnitId: gauge.id,
      pricingBaseFactorNumerator: '16',
      pricingBaseFactorDenominator: '1',
    })

    await products.updateProduct(product.id, {
      name: product.name,
      brand: product.brand,
      categoryId: product.category?.id ?? null,
      baseUnitId: product.baseUnit.id,
      barcode: product.primaryBarcode ?? '',
      defaultPurchasePricePaisa: product.defaultPurchasePricePaisa,
      defaultSellingPricePaisa: product.defaultSellingPricePaisa,
      minimumStockBaseQty: product.minimumStockBaseQty,
      trackingMode: product.trackingMode,
      advanced: {
        conversionProfile: {
          ...conversionProfile,
          displayPrecision: 3,
        },
      },
    })

    const second = await products.getAdvancedConfiguration(product.id)
    expect(second.conversionProfile).toMatchObject({
      version: 2,
      displayPrecision: 3,
    })
    expect(second.alternativeUnits).toEqual([
      expect.objectContaining({
        unit: expect.objectContaining({ id: gauge.id }),
        conversionMode: 'FIXED',
        conversionToBase: '16',
      }),
    ])
  })

})
