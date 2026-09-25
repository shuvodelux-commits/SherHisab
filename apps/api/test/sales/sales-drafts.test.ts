import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { CustomerService } from '../../src/modules/customers/customer.service'
import { FinanceRepository } from '../../src/modules/finance/finance.repository'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { SalesDraftService } from '../../src/modules/sales/sales-draft.service'
import { VendorService } from '../../src/modules/vendors/vendor.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from '../products/product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

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
})
