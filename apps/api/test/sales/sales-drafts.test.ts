import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import type { SalesDraftInput } from '../../src/modules/sales/sales-draft.types'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { CustomerService } from '../../src/modules/customers/customer.service'
import { FinanceRepository } from '../../src/modules/finance/finance.repository'
import { ConversionService } from '../../src/modules/products/conversion.service'
import { InventoryService } from '../../src/modules/products/inventory.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { SalesDraftService } from '../../src/modules/sales/sales-draft.service'
import { VendorService } from '../../src/modules/vendors/vendor.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

async function postableDraftFixture(name: string) {
  const tenant = await createProductTestTenant(name)
  const owner = await new AuthService().createUser({
    tenantId: tenant.id,
    name: 'Draft Post Owner',
    email: `draft-post-${randomUUID()}@example.com`,
    password: 'strong-password-123',
    role: 'OWNER',
  })
  const products = new ProductMasterService(tenant.id, getPool())
  const unit = (await products.listUnits()).find((candidate) => candidate.symbol === 'pcs')
  if (!unit) throw new Error('Default Piece unit not found')
  const product = await products.createProduct({
    name: `${name} Product`,
    baseUnitId: unit.id,
    defaultPurchasePricePaisa: '900',
    defaultSellingPricePaisa: '1400',
    openingStockBaseQty: '0',
    minimumStockBaseQty: '0',
    trackingMode: 'SIMPLE',
  }, owner.id)
  await new InventoryService(getPool()).adjustStock(
    tenant.id, owner.id, product.defaultVariantId,
    { deltaBaseQty: '10', note: 'Draft posting stock', unitCostPaisa: '900', sellingPricePaisa: '1400', businessDate: '2026-09-25' },
  )
  const state: SalesDraftInput = {
    customer: { selectedCustomerId: null, name: 'Draft Buyer', phone: '01770000001', guardianName: '', address: '' },
    discountPaisa: '0', payments: [], note: '',
    lines: [{
      variantId: product.defaultVariantId,
      quantityInput: { kind: 'SIMPLE', baseQty: '1' },
      normalizedQuantitySnapshot: { baseQty: '1', pricingQty: '1', displayQty: '1', components: {}, snapshot: null },
      pricingMode: 'AUTO', manualUnitSellingPricePaisa: null,
      shortageResolution: null, serialIds: [], batchSelection: null,
      warrantySnapshot: null, captureValues: {},
    }],
  }
  return { tenant, owner, product, state, service: new SalesDraftService(tenant.id, getPool()) }
}

async function businessMutationCounts(tenantId: string) {
  const result = await getPool().query<{
    sales_invoices: string
    inventory_movements: string
    customer_ledger_entries: string
    vendor_ledger_entries: string
    financial_movements: string
    vendor_sourcing: string
    inventory_shortfalls: string
  }>(
    `SELECT
       (SELECT COUNT(*)::text
        FROM sales_invoices
        WHERE tenant_id = $1) AS sales_invoices,
       (SELECT COUNT(*)::text
        FROM inventory_movements
        WHERE tenant_id = $1) AS inventory_movements,
       (SELECT COUNT(*)::text
        FROM customer_ledger_entries
        WHERE tenant_id = $1) AS customer_ledger_entries,
       (SELECT COUNT(*)::text
        FROM vendor_ledger_entries
        WHERE tenant_id = $1) AS vendor_ledger_entries,
       (SELECT COUNT(*)::text
        FROM financial_movements
        WHERE tenant_id = $1) AS financial_movements,
       (SELECT COUNT(*)::text
        FROM vendor_sourcing
        WHERE tenant_id = $1) AS vendor_sourcing,
       (SELECT COUNT(*)::text
        FROM inventory_shortfalls
        WHERE tenant_id = $1) AS inventory_shortfalls`,
    [tenantId],
  )

  const row = result.rows[0]
  if (!row) {
    throw new Error('Failed to read mutation counts')
  }
  return row
}

describe.skipIf(!hasDatabase)('versioned POS Drafts', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('saves full POS transaction state without mutating Sale, stock or accounting domains', async () => {
    const tenant = await createProductTestTenant(
      'Draft No Business Mutation',
    )
    const owner = await new AuthService().createUser({
      tenantId: tenant.id,
      name: 'Draft Owner',
      email: `draft-owner-${randomUUID()}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })

    const products = new ProductMasterService(
      tenant.id,
      getPool(),
    )
    const unit = (await products.listUnits()).find(
      (candidate) => candidate.symbol === 'pcs',
    )
    if (!unit) {
      throw new Error('Default Piece unit not found')
    }

    const product = await products.createProduct(
      {
        name: 'Draft Stateful Product',
        baseUnitId: unit.id,
        defaultPurchasePricePaisa: '900',
        defaultSellingPricePaisa: '1400',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      owner.id,
    )
    const customer = await new CustomerService(
      tenant.id,
      getPool(),
    ).create({
      name: 'Draft Customer',
      phone: '01711111111',
      guardianName: 'Draft Guardian',
      address: 'Belkuchi',
    })
    const vendor = await new VendorService(
      tenant.id,
      getPool(),
    ).create({
      name: 'Draft Vendor',
      phone: '01811111111',
      address: 'Sirajganj',
    })
    const bank = await new FinanceRepository(
      getPool(),
    ).createAccount({
      tenantId: tenant.id,
      type: 'BANK',
      name: 'Draft Bank',
      provider: 'Test Bank',
      accountReference: 'ACC-001',
    })

    const before = await businessMutationCounts(tenant.id)
    const serialId = randomUUID()
    const profileId = randomUUID()
    const componentUnitId = unit.id

    const draft = await new SalesDraftService(
      tenant.id,
      getPool(),
    ).create(owner.id, {
      customer: {
        selectedCustomerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        guardianName: customer.guardianName,
        address: customer.address,
      },
      discountPaisa: '125',
      note: 'Keep every POS field exactly',
      payments: [
        {
          clientLineId: 'cash-1',
          method: 'CASH',
          accountId: null,
          amountPaisa: '500',
          reference: '',
          note: 'Cash part',
        },
        {
          clientLineId: 'bank-1',
          method: 'BANK',
          accountId: bank.id,
          amountPaisa: '775',
          reference: 'BANK-REF',
          note: 'Bank part',
        },
      ],
      lines: [
        {
          variantId: product.defaultVariantId,
          quantityInput: {
            kind: 'COMPONENTS',
            profileId,
            profileVersion: 3,
            components: {
              gauge: '2',
              gira: '5',
            },
          },
          normalizedQuantitySnapshot: {
            baseQty: '37',
            pricingQty: '2.3125',
            displayQty: '2.31',
            components: {
              gauge: '2',
              gira: '5',
            },
            snapshot: {
              id: profileId,
              productId: product.id,
              type: 'COMPOUND',
              version: 3,
              baseUnitId: unit.id,
              pricingUnitId: unit.id,
              pricingBaseFactorNumerator: '16',
              pricingBaseFactorDenominator: '1',
              displayPrecision: 2,
              components: [
                {
                  id: randomUUID(),
                  key: 'gauge',
                  label: 'Gauge',
                  unitId: componentUnitId,
                  baseFactorNumerator: '16',
                  baseFactorDenominator: '1',
                  sortOrder: 0,
                  minValue: '0',
                  maxExclusive: null,
                  allowFraction: false,
                  autoNormalizeRemainder: false,
                },
                {
                  id: randomUUID(),
                  key: 'gira',
                  label: 'Gira',
                  unitId: componentUnitId,
                  baseFactorNumerator: '1',
                  baseFactorDenominator: '1',
                  sortOrder: 1,
                  minValue: '0',
                  maxExclusive: '16',
                  allowFraction: false,
                  autoNormalizeRemainder: true,
                },
              ],
            },
          },
          pricingMode: 'MANUAL',
          manualUnitSellingPricePaisa: '1500',
          shortageResolution: {
            type: 'VENDOR',
            vendorId: vendor.id,
            unitCostPaisa: '850',
          },
          serialIds: [serialId],
          batchSelection: {
            lotId: randomUUID(),
            batchCode: 'BATCH-DRAFT',
            expiresOn: '2027-12-31',
          },
          warrantySnapshot: {
            durationValue: 12,
            durationUnit: 'MONTH',
            provider: 'SELLER',
            text: 'Draft warranty snapshot',
          },
          captureValues: {
            vehicle_no: 'DHAKA-METRO-11',
          },
        },
      ],
    })

    expect(draft).toMatchObject({
      tenantId: tenant.id,
      ownerUserId: owner.id,
      version: 1,
      status: 'ACTIVE',
      customer: {
        selectedCustomerId: customer.id,
        name: 'Draft Customer',
        phone: '01711111111',
      },
      discountPaisa: '125',
      note: 'Keep every POS field exactly',
    })

    expect(await businessMutationCounts(tenant.id)).toEqual(before)
  })

  it('loads and updates the complete Draft state without losing payment or line details', async () => {
    const tenant = await createProductTestTenant('Draft Round Trip')
    const owner = await new AuthService().createUser({
      tenantId: tenant.id,
      name: 'Draft Round Trip Owner',
      email: `draft-round-trip-${randomUUID()}@example.com`,
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
        name: 'Round Trip Product',
        baseUnitId: unit.id,
        defaultPurchasePricePaisa: '1000',
        defaultSellingPricePaisa: '1600',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      owner.id,
    )
    const vendor = await new VendorService(
      tenant.id,
      getPool(),
    ).create({
      name: 'Round Trip Vendor',
      phone: '01822222222',
      address: 'Belkuchi',
    })
    const bank = await new FinanceRepository(
      getPool(),
    ).createAccount({
      tenantId: tenant.id,
      type: 'BANK',
      name: 'Round Trip Bank',
      provider: 'DBBL',
      accountReference: 'DRAFT-ROUND-TRIP',
    })
    const service = new SalesDraftService(tenant.id, getPool())
    const profileId = randomUUID()
    const serialId = randomUUID()
    const batchLotId = randomUUID()

    const created = await service.create(owner.id, {
      customer: {
        selectedCustomerId: null,
        name: 'Draft Buyer',
        phone: '01722222222',
        guardianName: 'Draft Guardian',
        address: 'Sirajganj',
      },
      discountPaisa: '75',
      payments: [
        {
          clientLineId: 'cash-round-trip',
          method: 'CASH',
          accountId: null,
          amountPaisa: '500',
          reference: '',
          note: 'Cash row',
        },
        {
          clientLineId: 'bank-round-trip',
          method: 'BANK',
          accountId: bank.id,
          amountPaisa: '1025',
          reference: 'DBBL-001',
          note: 'Bank row',
        },
      ],
      note: 'Original Draft note',
      lines: [
        {
          variantId: product.defaultVariantId,
          quantityInput: {
            kind: 'COMPONENTS',
            profileId,
            profileVersion: 4,
            components: { gauge: '2', gira: '5' },
          },
          normalizedQuantitySnapshot: {
            baseQty: '37',
            pricingQty: '2.3125',
            displayQty: '2.31',
            components: { gauge: '2', gira: '5' },
            snapshot: {
              id: profileId,
              productId: product.id,
              type: 'COMPOUND',
              version: 4,
              baseUnitId: unit.id,
              pricingUnitId: unit.id,
              pricingBaseFactorNumerator: '16',
              pricingBaseFactorDenominator: '1',
              displayPrecision: 2,
              components: [],
            },
          },
          pricingMode: 'MANUAL',
          manualUnitSellingPricePaisa: '1600',
          shortageResolution: {
            type: 'VENDOR',
            vendorId: vendor.id,
            unitCostPaisa: '950',
          },
          serialIds: [serialId],
          batchSelection: {
            lotId: batchLotId,
            batchCode: 'ROUND-TRIP-BATCH',
            expiresOn: '2028-01-31',
          },
          warrantySnapshot: {
            durationValue: 6,
            durationUnit: 'MONTH',
            provider: 'SELLER',
            text: 'Round trip warranty',
          },
          captureValues: {
            vehicle_no: 'DHAKA-METRO-22',
            color: 'Black',
          },
        },
      ],
    })

    await expect(service.get(created.id, owner.id)).resolves.toMatchObject({
      id: created.id,
      version: 1,
      customer: {
        name: 'Draft Buyer',
        phone: '01722222222',
      },
      discountPaisa: '75',
      payments: [
        expect.objectContaining({
          clientLineId: 'cash-round-trip',
          method: 'CASH',
          amountPaisa: '500',
        }),
        expect.objectContaining({
          clientLineId: 'bank-round-trip',
          method: 'BANK',
          accountId: bank.id,
          amountPaisa: '1025',
        }),
      ],
      lines: [
        expect.objectContaining({
          variantId: product.defaultVariantId,
          quantityInput: {
            kind: 'COMPONENTS',
            profileId,
            profileVersion: 4,
            components: { gauge: '2', gira: '5' },
          },
          normalizedQuantitySnapshot: expect.objectContaining({
            baseQty: '37',
            pricingQty: '2.3125',
            displayQty: '2.31',
            components: { gauge: '2', gira: '5' },
          }),
          shortageResolution: {
            type: 'VENDOR',
            vendorId: vendor.id,
            unitCostPaisa: '950',
          },
          serialIds: [serialId],
          batchSelection: {
            lotId: batchLotId,
            batchCode: 'ROUND-TRIP-BATCH',
            expiresOn: '2028-01-31',
          },
          captureValues: {
            vehicle_no: 'DHAKA-METRO-22',
            color: 'Black',
          },
        }),
      ],
    })

    const updated = await service.update(
      owner.id,
      created.id,
      created.version,
      {
        customer: {
          selectedCustomerId: null,
          name: 'Updated Draft Buyer',
          phone: '01733333333',
          guardianName: 'Updated Guardian',
          address: 'Dhaka',
        },
        discountPaisa: '125',
        payments: [
          {
            clientLineId: 'cash-updated',
            method: 'CASH',
            accountId: null,
            amountPaisa: '1475',
            reference: '',
            note: 'Updated cash row',
          },
        ],
        note: 'Updated Draft note',
        lines: [
          {
            variantId: product.defaultVariantId,
            quantityInput: {
              kind: 'SIMPLE',
              baseQty: '3',
            },
            normalizedQuantitySnapshot: {
              baseQty: '3',
              pricingQty: '3',
              displayQty: '3',
              components: {},
              snapshot: null,
            },
            pricingMode: 'AUTO',
            manualUnitSellingPricePaisa: null,
            shortageResolution: {
              type: 'NEGATIVE_STOCK',
            },
            serialIds: [],
            batchSelection: null,
            warrantySnapshot: null,
            captureValues: {
              note: 'Updated capture',
            },
          },
        ],
      },
    )

    expect(updated).toMatchObject({
      id: created.id,
      version: 2,
      customer: {
        name: 'Updated Draft Buyer',
        phone: '01733333333',
      },
      discountPaisa: '125',
      payments: [
        expect.objectContaining({
          clientLineId: 'cash-updated',
          amountPaisa: '1475',
        }),
      ],
      note: 'Updated Draft note',
      lines: [
        expect.objectContaining({
          quantityInput: { kind: 'SIMPLE', baseQty: '3' },
          shortageResolution: { type: 'NEGATIVE_STOCK' },
          serialIds: [],
          batchSelection: null,
          captureValues: { note: 'Updated capture' },
        }),
      ],
    })

    await expect(service.get(created.id, owner.id)).resolves.toEqual(updated)

    const audit = await getPool().query<{
      action: string
      draft_version: number
      actor_user_id: string
    }>(
      `SELECT action, draft_version, actor_user_id::text
       FROM sales_draft_audit
       WHERE tenant_id = $1 AND draft_id = $2
       ORDER BY created_at, id`,
      [tenant.id, created.id],
    )
    expect(audit.rows).toEqual([
      { action: 'CREATED', draft_version: 1, actor_user_id: owner.id },
      { action: 'UPDATED', draft_version: 2, actor_user_id: owner.id },
    ])
  })

  it('loads the saved conversion profile snapshot unchanged after the Product profile advances', async () => {
    const tenant = await createProductTestTenant(
      'Draft Conversion Snapshot',
    )
    const owner = await new AuthService().createUser({
      tenantId: tenant.id,
      name: 'Draft Conversion Owner',
      email: `draft-conversion-${randomUUID()}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })
    const products = new ProductMasterService(tenant.id, getPool())
    const gira = await products.createUnit({
      name: 'Draft Gira',
      symbol: 'dgira',
    })
    const gauge = await products.createUnit({
      name: 'Draft Gauge',
      symbol: 'dgauge',
    })
    const product = await products.createProduct(
      {
        name: 'Draft Fabric',
        baseUnitId: gira.id,
        defaultPurchasePricePaisa: '10000',
        defaultSellingPricePaisa: '30000',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      owner.id,
    )
    const conversion = new ConversionService(tenant.id, getPool())
    const profileV1 = await conversion.replaceActiveProfile(product.id, {
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
    })
    const quantityInput = {
      kind: 'COMPONENTS' as const,
      profileId: profileV1.id,
      profileVersion: profileV1.version,
      components: { gauge: '2', gira: '5' },
    }
    const normalized = await conversion.normalize(quantityInput)
    const service = new SalesDraftService(tenant.id, getPool())
    const created = await service.create(owner.id, {
      customer: {
        selectedCustomerId: null,
        name: 'Fabric Buyer',
        phone: '01744444444',
        guardianName: '',
        address: '',
      },
      discountPaisa: '0',
      payments: [],
      note: '',
      lines: [
        {
          variantId: product.defaultVariantId,
          quantityInput,
          normalizedQuantitySnapshot: normalized,
          pricingMode: 'AUTO',
          manualUnitSellingPricePaisa: null,
          shortageResolution: null,
          serialIds: [],
          batchSelection: null,
          warrantySnapshot: null,
          captureValues: {},
        },
      ],
    })

    const profileV2 = await conversion.replaceActiveProfile(product.id, {
      type: 'COMPOUND',
      baseUnitId: gira.id,
      pricingUnitId: gauge.id,
      pricingBaseFactorNumerator: '16',
      pricingBaseFactorDenominator: '1',
      displayPrecision: 3,
      components: profileV1.components.map((component) => ({
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
    })

    expect(profileV2.version).toBe(2)

    const loaded = await service.get(created.id, owner.id)
    expect(loaded.lines[0]).toMatchObject({
      quantityInput: {
        kind: 'COMPONENTS',
        profileId: profileV1.id,
        profileVersion: 1,
        components: { gauge: '2', gira: '5' },
      },
      normalizedQuantitySnapshot: {
        baseQty: '37',
        pricingQty: '2.3125',
        displayQty: '2.31',
        components: { gauge: '2', gira: '5' },
        snapshot: expect.objectContaining({
          id: profileV1.id,
          version: 1,
          displayPrecision: 2,
        }),
      },
    })
  })


  it('rejects a stale expectedVersion and reports the current Draft version', async () => {
    const tenant = await createProductTestTenant('Draft Version Conflict')
    const owner = await new AuthService().createUser({
      tenantId: tenant.id,
      name: 'Draft Conflict Owner',
      email: `draft-conflict-${randomUUID()}@example.com`,
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
        name: 'Draft Conflict Product',
        baseUnitId: unit.id,
        defaultPurchasePricePaisa: '1000',
        defaultSellingPricePaisa: '1500',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      owner.id,
    )
    const service = new SalesDraftService(tenant.id, getPool())
    const state = {
      customer: {
        selectedCustomerId: null,
        name: 'Conflict Buyer',
        phone: '01755555555',
        guardianName: '',
        address: '',
      },
      discountPaisa: '0',
      payments: [],
      note: 'Version one',
      lines: [
        {
          variantId: product.defaultVariantId,
          quantityInput: {
            kind: 'SIMPLE' as const,
            baseQty: '1',
          },
          normalizedQuantitySnapshot: {
            baseQty: '1',
            pricingQty: '1',
            displayQty: '1',
            components: {},
            snapshot: null,
          },
          pricingMode: 'AUTO' as const,
          manualUnitSellingPricePaisa: null,
          shortageResolution: null,
          serialIds: [],
          batchSelection: null,
          warrantySnapshot: null,
          captureValues: {},
        },
      ],
    }

    const created = await service.create(owner.id, state)
    const versionTwo = await service.update(
      owner.id,
      created.id,
      created.version,
      {
        ...state,
        note: 'Version two',
      },
    )
    expect(versionTwo.version).toBe(2)

    await expect(
      service.update(
        owner.id,
        created.id,
        created.version,
        {
          ...state,
          note: 'Stale write must not win',
        },
      ),
    ).rejects.toMatchObject({
      name: 'SalesDraftVersionConflictError',
      currentVersion: 2,
    })

    await expect(service.get(created.id, owner.id)).resolves.toMatchObject({
      version: 2,
      note: 'Version two',
    })
  })


  it('posts a Draft idempotently through the authoritative SalesService', async () => {
    const tenant = await createProductTestTenant('Draft Idempotent Post')
    const owner = await new AuthService().createUser({
      tenantId: tenant.id,
      name: 'Draft Post Owner',
      email: `draft-post-${randomUUID()}@example.com`,
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
        name: 'Draft Post Product',
        baseUnitId: unit.id,
        defaultPurchasePricePaisa: '900',
        defaultSellingPricePaisa: '1400',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      owner.id,
    )
    await new InventoryService(getPool()).adjustStock(
      tenant.id,
      owner.id,
      product.defaultVariantId,
      {
        deltaBaseQty: '10',
        note: 'Draft posting stock',
        unitCostPaisa: '900',
        sellingPricePaisa: '1400',
        businessDate: '2026-09-25',
      },
    )

    const service = new SalesDraftService(tenant.id, getPool())
    const created = await service.create(owner.id, {
      customer: {
        selectedCustomerId: null,
        name: 'Posted Draft Buyer',
        phone: '01770000001',
        guardianName: '',
        address: 'Belkuchi',
      },
      discountPaisa: '0',
      payments: [],
      note: 'Post me once',
      lines: [
        {
          variantId: product.defaultVariantId,
          quantityInput: {
            kind: 'SIMPLE',
            baseQty: '2',
          },
          normalizedQuantitySnapshot: {
            baseQty: '2',
            pricingQty: '2',
            displayQty: '2',
            components: {},
            snapshot: null,
          },
          pricingMode: 'AUTO',
          manualUnitSellingPricePaisa: null,
          shortageResolution: null,
          serialIds: [],
          batchSelection: null,
          warrantySnapshot: null,
          captureValues: {},
        },
      ],
    })
    const operationId = randomUUID()

    const first = await service.post(
      owner.id,
      created.id,
      created.version,
      {
        operationId,
        businessDate: '2026-09-25',
        canOverrideSellingPrice: true,
      },
    )
    const afterFirst = await businessMutationCounts(tenant.id)

    const repeated = await service.post(
      owner.id,
      created.id,
      created.version,
      {
        operationId,
        businessDate: '2026-09-25',
        canOverrideSellingPrice: true,
      },
    )

    expect(repeated.id).toBe(first.id)
    expect(repeated.invoiceNumber).toBe(first.invoiceNumber)
    expect(await businessMutationCounts(tenant.id)).toEqual(afterFirst)

    const invoices = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM sales_invoices
       WHERE tenant_id = $1`,
      [tenant.id],
    )
    expect(invoices.rows[0]?.count).toBe('1')

    await expect(service.get(created.id, owner.id)).resolves.toMatchObject({
      id: created.id,
      version: created.version,
      status: 'POSTED',
      postedSaleId: first.id,
    })

    const posted = await getPool().query<{
      posted_operation_id: string | null
    }>(
      `SELECT posted_operation_id::text
       FROM sales_drafts
       WHERE tenant_id = $1 AND id = $2`,
      [tenant.id, created.id],
    )
    expect(posted.rows[0]?.posted_operation_id).toBe(operationId)

    const audit = await getPool().query<{
      action: string
      draft_version: number
      actor_user_id: string
    }>(
      `SELECT action, draft_version, actor_user_id::text
       FROM sales_draft_audit
       WHERE tenant_id = $1 AND draft_id = $2
       ORDER BY created_at, id`,
      [tenant.id, created.id],
    )
    expect(audit.rows).toEqual([
      { action: 'CREATED', draft_version: 1, actor_user_id: owner.id },
      { action: 'POSTED', draft_version: 1, actor_user_id: owner.id },
    ])
  })

  it('rejects posting when the active conversion profile would reinterpret saved components', async () => {
    const tenant = await createProductTestTenant(
      'Draft Conversion Post',
    )
    const owner = await new AuthService().createUser({
      tenantId: tenant.id,
      name: 'Draft Conversion Post Owner',
      email: `draft-conversion-post-${randomUUID()}@example.com`,
      password: 'strong-password-123',
      role: 'OWNER',
    })
    const products = new ProductMasterService(tenant.id, getPool())
    const gira = await products.createUnit({
      name: 'Post Gira',
      symbol: 'pgira',
    })
    const gauge = await products.createUnit({
      name: 'Post Gauge',
      symbol: 'pgauge',
    })
    const product = await products.createProduct(
      {
        name: 'Draft Conversion Post Fabric',
        baseUnitId: gira.id,
        defaultPurchasePricePaisa: '1000',
        defaultSellingPricePaisa: '2000',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      owner.id,
    )
    await new InventoryService(getPool()).adjustStock(
      tenant.id,
      owner.id,
      product.defaultVariantId,
      {
        deltaBaseQty: '50',
        note: 'Conversion Draft stock',
        unitCostPaisa: '1000',
        sellingPricePaisa: '2000',
        businessDate: '2026-09-25',
      },
    )
    const conversion = new ConversionService(tenant.id, getPool())
    const profileV1 = await conversion.replaceActiveProfile(product.id, {
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
    })
    const quantityInput = {
      kind: 'COMPONENTS' as const,
      profileId: profileV1.id,
      profileVersion: profileV1.version,
      components: { gauge: '2', gira: '5' },
    }
    const normalized = await conversion.normalize(quantityInput)
    expect(normalized.baseQty).toBe('37')

    const service = new SalesDraftService(tenant.id, getPool())
    const draft = await service.create(owner.id, {
      customer: {
        selectedCustomerId: null,
        name: 'Conversion Draft Buyer',
        phone: '01770000002',
        guardianName: '',
        address: '',
      },
      discountPaisa: '0',
      payments: [],
      note: '',
      lines: [
        {
          variantId: product.defaultVariantId,
          quantityInput,
          normalizedQuantitySnapshot: normalized,
          pricingMode: 'AUTO',
          manualUnitSellingPricePaisa: null,
          shortageResolution: null,
          serialIds: [],
          batchSelection: null,
          warrantySnapshot: null,
          captureValues: {},
        },
      ],
    })

    const profileV2 = await conversion.replaceActiveProfile(product.id, {
      type: 'COMPOUND',
      baseUnitId: gira.id,
      pricingUnitId: gauge.id,
      pricingBaseFactorNumerator: '20',
      pricingBaseFactorDenominator: '1',
      displayPrecision: 3,
      components: [
        {
          key: 'gauge',
          label: 'Gauge',
          unitId: gauge.id,
          baseFactorNumerator: '20',
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
          maxExclusive: '20',
          allowFraction: false,
          autoNormalizeRemainder: false,
        },
      ],
    })
    expect(profileV2.version).toBe(2)

    await expect(
      service.post(owner.id, draft.id, draft.version, {
        operationId: randomUUID(),
        businessDate: '2026-09-25',
        canOverrideSellingPrice: true,
      }),
    ).rejects.toThrow(/conversion/i)

    const compatibleProduct = await products.createProduct(
      {
        name: 'Unrelated Compatible Conversion Product',
        baseUnitId: gira.id,
        defaultPurchasePricePaisa: '1000',
        defaultSellingPricePaisa: '2000',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      owner.id,
    )
    await conversion.replaceActiveProfile(compatibleProduct.id, {
      type: 'COMPOUND',
      baseUnitId: gira.id,
      pricingUnitId: gauge.id,
      pricingBaseFactorNumerator: '16',
      pricingBaseFactorDenominator: '1',
      displayPrecision: 2,
      components: profileV1.components.map((component) => ({
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
    })
    const spoofedDraft = await service.create(owner.id, {
      customer: {
        selectedCustomerId: null,
        name: 'Conversion Buyer',
        phone: '01770000002',
        guardianName: '',
        address: '',
      },
      discountPaisa: '0',
      payments: [],
      note: '',
      lines: [{
        variantId: product.defaultVariantId,
        quantityInput,
        normalizedQuantitySnapshot: {
          ...normalized,
          snapshot: { ...profileV1, productId: compatibleProduct.id },
        },
        pricingMode: 'AUTO',
        manualUnitSellingPricePaisa: null,
        shortageResolution: null,
        serialIds: [],
        batchSelection: null,
        warrantySnapshot: null,
        captureValues: {},
      }],
    })
    await expect(
      service.post(owner.id, spoofedDraft.id, spoofedDraft.version, {
        operationId: randomUUID(),
        businessDate: '2026-09-25',
        canOverrideSellingPrice: true,
      }),
    ).rejects.toThrow(/product|conversion/i)

    const invoices = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM sales_invoices
       WHERE tenant_id = $1`,
      [tenant.id],
    )
    expect(invoices.rows[0]?.count).toBe('0')
  })


  it('lists recent ACTIVE Drafts newest-first and archives with optimistic versioning', async () => {
    const tenant = await createProductTestTenant('Recent Drafts')
    const owner = await new AuthService().createUser({
      tenantId: tenant.id,
      name: 'Recent Draft Owner',
      email: `recent-draft-${randomUUID()}@example.com`,
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
        name: 'Recent Draft Product',
        baseUnitId: unit.id,
        defaultPurchasePricePaisa: '1000',
        defaultSellingPricePaisa: '1500',
        openingStockBaseQty: '0',
        minimumStockBaseQty: '0',
        trackingMode: 'SIMPLE',
      },
      owner.id,
    )
    const service = new SalesDraftService(tenant.id, getPool())
    const state = (name: string) => ({
      customer: {
        selectedCustomerId: null,
        name,
        phone: '01710000000',
        guardianName: '',
        address: '',
      },
      discountPaisa: '0',
      payments: [],
      note: '',
      lines: [
        {
          variantId: product.defaultVariantId,
          quantityInput: {
            kind: 'SIMPLE' as const,
            baseQty: '1',
          },
          normalizedQuantitySnapshot: {
            baseQty: '1',
            pricingQty: '1',
            displayQty: '1',
            components: {},
            snapshot: null,
          },
          pricingMode: 'AUTO' as const,
          manualUnitSellingPricePaisa: null,
          shortageResolution: null,
          serialIds: [],
          batchSelection: null,
          warrantySnapshot: null,
          captureValues: {},
        },
      ],
    })

    const first = await service.create(owner.id, state('First Buyer'))
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await service.create(owner.id, state('Second Buyer'))

    const recent = await service.listRecent(owner.id, 5)
    expect(recent.map((draft) => draft.id)).toEqual([
      second.id,
      first.id,
    ])

    const archived = await service.archive(
      owner.id,
      first.id,
      first.version,
    )
    expect(archived).toMatchObject({
      id: first.id,
      status: 'ARCHIVED',
      version: first.version + 1,
    })

    await expect(
      service.archive(owner.id, first.id, first.version),
    ).rejects.toMatchObject({
      name: 'SalesDraftVersionConflictError',
      currentVersion: first.version + 1,
    })

    const activeOnly = await service.listRecent(owner.id, 5)
    expect(activeOnly.map((draft) => draft.id)).toEqual([second.id])

    const audit = await getPool().query<{
      action: string
      draft_version: number
    }>(
      `SELECT action, draft_version
       FROM sales_draft_audit
       WHERE tenant_id = $1 AND draft_id = $2
       ORDER BY created_at, id`,
      [tenant.id, first.id],
    )
    expect(audit.rows).toEqual([
      { action: 'CREATED', draft_version: 1 },
      { action: 'ARCHIVED', draft_version: 2 },
    ])
  })

  it('rejects a second Draft using an operation ID already bound to another Draft', async () => {
    const { tenant, owner, state, service } = await postableDraftFixture('Draft Operation Binding')
    const first = await service.create(owner.id, state)
    const second = await service.create(owner.id, { ...state, note: 'Different transaction' })
    const operationId = randomUUID()
    const sale = await service.post(owner.id, first.id, first.version, {
      operationId, businessDate: '2026-09-25', canOverrideSellingPrice: true,
    })

    await expect(service.post(owner.id, second.id, second.version, {
      operationId, businessDate: '2026-09-25', canOverrideSellingPrice: true,
    })).rejects.toThrow(/operation|draft|conflict/i)

    expect(await service.get(second.id, owner.id)).toMatchObject({ status: 'ACTIVE', postedSaleId: null })
    const invoices = await getPool().query<{ id: string; source_draft_id: string; source_draft_version: number }>(
      `SELECT id, source_draft_id::text, source_draft_version FROM sales_invoices WHERE tenant_id = $1`,
      [tenant.id],
    )
    expect(invoices.rows).toEqual([{ id: sale.id, source_draft_id: first.id, source_draft_version: first.version }])
  })

  it('rejects a simple quantity snapshot that differs from the entered quantity', async () => {
    const { owner, state, service } = await postableDraftFixture('Draft Simple Quantity')
    state.lines[0]!.normalizedQuantitySnapshot.baseQty = '5'
    await expect(service.create(owner.id, state)).rejects.toThrow(/quantity|snapshot/i)
  })

  it('revalidates a stored simple quantity before any sale mutation', async () => {
    const { tenant, owner, state, service } = await postableDraftFixture('Draft Stored Quantity')
    const draft = await service.create(owner.id, state)
    await getPool().query(
      `UPDATE sales_draft_lines SET base_qty = 5, normalized_quantity_snapshot = jsonb_set(normalized_quantity_snapshot, '{baseQty}', '"5"') WHERE tenant_id = $1 AND draft_id = $2`,
      [tenant.id, draft.id],
    )
    await expect(service.post(owner.id, draft.id, draft.version, {
      operationId: randomUUID(), businessDate: '2026-09-25', canOverrideSellingPrice: true,
    })).rejects.toThrow(/quantity|snapshot/i)
    expect((await businessMutationCounts(tenant.id)).sales_invoices).toBe('0')
  })

  it.each(['update', 'archive'] as const)('does not commit a sale against a concurrent %s', async (mutation) => {
    const { tenant, owner, state, service } = await postableDraftFixture(`Draft Concurrent ${mutation}`)
    const draft = await service.create(owner.id, state)
    await getPool().query(
      `INSERT INTO tenant_document_counters (tenant_id, document_type, next_value) VALUES ($1, 'INV', 1) ON CONFLICT DO NOTHING`,
      [tenant.id],
    )
    const blocker = await getPool().connect()
    const postingClient = await getPool().connect()
    const postingService = new SalesDraftService(tenant.id, postingClient)
    const postingPid = (await postingClient.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    )).rows[0]?.pid
    await blocker.query('BEGIN')
    await blocker.query(
      `SELECT next_value FROM tenant_document_counters WHERE tenant_id = $1 AND document_type = 'INV' FOR UPDATE`,
      [tenant.id],
    )
    let posting: Promise<unknown> | null = null
    let competing: Promise<unknown> | null = null
    try {
      posting = postingService.post(owner.id, draft.id, draft.version, {
        operationId: randomUUID(), businessDate: '2026-09-25', canOverrideSellingPrice: true,
      })
      // Wait until posting reaches the locked Invoice counter, then race the mutation.
      let reachedCounter = false
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await getPool().query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock' AND query LIKE 'INSERT INTO tenant_document_counters%'`,
          [postingPid],
        )
        if (Number(waiting.rows[0]?.count) > 0) {
          reachedCounter = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(reachedCounter).toBe(true)
      competing = mutation === 'update'
        ? service.update(owner.id, draft.id, draft.version, { ...state, note: 'Competing update' })
        : service.archive(owner.id, draft.id, draft.version)
      await blocker.query('COMMIT')
      const sale = await posting as { id: string }
      await expect(competing).rejects.toThrow()
      expect(await service.get(draft.id, owner.id)).toMatchObject({ status: 'POSTED', postedSaleId: sale.id })
      const audit = await getPool().query<{ action: string }>(
        `SELECT action FROM sales_draft_audit WHERE tenant_id = $1 AND draft_id = $2 AND action = 'POSTED'`,
        [tenant.id, draft.id],
      )
      expect(audit.rows).toHaveLength(1)
    } finally {
      await blocker.query('ROLLBACK')
      await Promise.allSettled([posting, competing].filter((operation) => operation !== null))
      blocker.release()
      postingClient.release()
    }
  })
})
