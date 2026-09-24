import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { AuthService } from '../../src/modules/auth/auth.service'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import { TrackingService } from '../../src/modules/products/tracking.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from './product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

function migrationPath(name: string): string {
  return fileURLToPath(
    new URL(`../../../../db/migrations/${name}`, import.meta.url),
  )
}

async function applyMigration(
  client: Client,
  name: string,
): Promise<void> {
  await client.query(readFileSync(migrationPath(name), 'utf8'))
}

describe.skipIf(!hasDatabase)('inventory tracking migration', () => {
  it('upgrades legacy tracking modes without dropping Products and defaults allocation to FIFO', async () => {
    const trackingMigration = migrationPath(
      '008_inventory_tracking.sql',
    )

    expect(
      existsSync(trackingMigration),
      '008 inventory tracking migration must exist',
    ).toBe(true)

    const sourceUrl = new URL(process.env.DATABASE_URL!)
    const databaseName = `sherhisab_tracking_${randomUUID().replaceAll('-', '')}`
    const adminUrl = new URL(sourceUrl)
    adminUrl.pathname = '/postgres'
    const isolatedUrl = new URL(sourceUrl)
    isolatedUrl.pathname = `/${databaseName}`

    const admin = new Client({
      connectionString: adminUrl.toString(),
    })
    await admin.connect()

    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`)
    } finally {
      await admin.end()
    }

    const isolated = new Client({
      connectionString: isolatedUrl.toString(),
    })

    try {
      await isolated.connect()

      for (const migration of [
        '001_foundation.sql',
        '002_tenants.sql',
        '003_users_sessions.sql',
      ]) {
        await applyMigration(isolated, migration)
      }

      const tenantResult = await isolated.query<{ id: string }>(
        `INSERT INTO tenants (name, slug)
         VALUES ('Tracking Migration Tenant', $1)
         RETURNING id`,
        [`tracking-${randomUUID()}`],
      )
      const tenantId = tenantResult.rows[0]?.id
      expect(tenantId).toBeTruthy()

      for (const migration of [
        '004_product_master_inventory.sql',
        '005_roles_permissions_lot_price_audit.sql',
        '006_sales_foundation.sql',
        '007_quantity_conversion.sql',
      ]) {
        await applyMigration(isolated, migration)
      }

      const unitResult = await isolated.query<{ id: string }>(
        `SELECT id
         FROM units
         WHERE tenant_id = $1
           AND name = 'Piece'`,
        [tenantId],
      )
      const unitId = unitResult.rows[0]?.id
      expect(unitId).toBeTruthy()

      await isolated.query(
        `INSERT INTO products
         (tenant_id, name, base_unit_id, tracking_mode)
         VALUES
           ($1, 'Legacy Simple', $2, 'SIMPLE'),
           ($1, 'Legacy Lot', $2, 'LOT'),
           ($1, 'Legacy Batch', $2, 'BATCH')`,
        [tenantId, unitId],
      )

      await applyMigration(isolated, '008_inventory_tracking.sql')

      const products = await isolated.query<{
        name: string
        tracking_mode: string
        allocation_policy: string
      }>(
        `SELECT name, tracking_mode, allocation_policy
         FROM products
         WHERE tenant_id = $1
         ORDER BY name`,
        [tenantId],
      )

      expect(products.rows).toEqual([
        {
          name: 'Legacy Batch',
          tracking_mode: 'BATCH_EXPIRY',
          allocation_policy: 'FIFO',
        },
        {
          name: 'Legacy Lot',
          tracking_mode: 'SIMPLE',
          allocation_policy: 'FIFO',
        },
        {
          name: 'Legacy Simple',
          tracking_mode: 'SIMPLE',
          allocation_policy: 'FIFO',
        },
      ])

      await expect(
        isolated.query(
          `UPDATE products
           SET tracking_mode = 'LOT'
           WHERE tenant_id = $1
             AND name = 'Legacy Simple'`,
          [tenantId],
        ),
      ).rejects.toMatchObject({ code: '23514' })
    } finally {
      await isolated.end().catch(() => undefined)

      const cleanup = new Client({
        connectionString: adminUrl.toString(),
      })
      await cleanup.connect()

      try {
        await cleanup.query(
          `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
        )
      } finally {
        await cleanup.end()
      }
    }
  })
})


async function createTrackingFixture(name: string) {
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

  const first = await products.createProduct(
    {
      name: `${name} First`,
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '1000',
      defaultSellingPricePaisa: '1500',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    owner.id,
  )
  const second = await products.createProduct(
    {
      name: `${name} Second`,
      baseUnitId: unit.id,
      defaultPurchasePricePaisa: '1200',
      defaultSellingPricePaisa: '1800',
      openingStockBaseQty: '0',
      minimumStockBaseQty: '0',
      trackingMode: 'SIMPLE',
    },
    owner.id,
  )

  await getPool().query(
    `UPDATE products
     SET tracking_mode = 'SERIAL'
     WHERE tenant_id = $1
       AND id = ANY($2::uuid[])`,
    [tenant.id, [first.id, second.id]],
  )

  return { tenant, owner, first, second }
}

async function insertSerial(input: {
  tenantId: string
  variantId: string
  serialNumber: string
}) {
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO inventory_serials
     (tenant_id, variant_id, serial_number, received_on)
     VALUES ($1, $2, $3, '2026-09-24')
     RETURNING id`,
    [input.tenantId, input.variantId, input.serialNumber],
  )

  const id = result.rows[0]?.id
  if (!id) {
    throw new Error('Failed to create serial fixture')
  }

  return id
}

async function insertSalesLine(input: {
  tenantId: string
  userId: string
  variantId: string
}) {
  const invoice = await getPool().query<{ id: string }>(
    `INSERT INTO sales_invoices
     (tenant_id, business_date, created_by_user_id)
     VALUES ($1, '2026-09-24', $2)
     RETURNING id`,
    [input.tenantId, input.userId],
  )
  const saleId = invoice.rows[0]?.id

  if (!saleId) {
    throw new Error('Failed to create sale fixture')
  }

  const line = await getPool().query<{ id: string }>(
    `INSERT INTO sales_lines
     (
       tenant_id,
       sale_id,
       variant_id,
       base_qty,
       pricing_mode,
       automatic_sales_total_paisa,
       final_sales_total_paisa,
       cogs_paisa
     )
     VALUES ($1, $2, $3, 1, 'LOT', 1500, 1500, 1000)
     RETURNING id`,
    [input.tenantId, saleId, input.variantId],
  )

  const lineId = line.rows[0]?.id
  if (!lineId) {
    throw new Error('Failed to create sales line fixture')
  }

  return lineId
}

describe.skipIf(!hasDatabase)('serial and warranty tracking', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('requires exactly one available serial per whole sale unit and rejects wrong-Variant selections', async () => {
    const fixture = await createTrackingFixture('Serial Validation')
    const firstSerial = await insertSerial({
      tenantId: fixture.tenant.id,
      variantId: fixture.first.defaultVariantId,
      serialNumber: 'SER-001',
    })
    const secondSerial = await insertSerial({
      tenantId: fixture.tenant.id,
      variantId: fixture.first.defaultVariantId,
      serialNumber: 'SER-002',
    })
    const wrongVariantSerial = await insertSerial({
      tenantId: fixture.tenant.id,
      variantId: fixture.second.defaultVariantId,
      serialNumber: 'SER-OTHER',
    })
    const tracking = new TrackingService(
      fixture.tenant.id,
      getPool(),
    )

    await expect(
      tracking.validateAndLockSerials({
        variantId: fixture.first.defaultVariantId,
        baseQty: '2',
        serialIds: [firstSerial],
      }),
    ).rejects.toThrow('exactly 2 serials')

    await expect(
      tracking.validateAndLockSerials({
        variantId: fixture.first.defaultVariantId,
        baseQty: '2',
        serialIds: [firstSerial, firstSerial],
      }),
    ).rejects.toThrow('Serial selections must be unique')

    await expect(
      tracking.validateAndLockSerials({
        variantId: fixture.first.defaultVariantId,
        baseQty: '2',
        serialIds: [firstSerial, wrongVariantSerial],
      }),
    ).rejects.toThrow('Serial is unavailable for this Variant')

    await expect(
      tracking.validateAndLockSerials({
        variantId: fixture.first.defaultVariantId,
        baseQty: '2',
        serialIds: [firstSerial, secondSerial],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: firstSerial,
        serialNumber: 'SER-001',
      }),
      expect.objectContaining({
        id: secondSerial,
        serialNumber: 'SER-002',
      }),
    ])
  })

  it('locks selected serials so a competing sale cannot validate the same serial after it is sold', async () => {
    const fixture = await createTrackingFixture('Serial Lock')
    const serialId = await insertSerial({
      tenantId: fixture.tenant.id,
      variantId: fixture.first.defaultVariantId,
      serialNumber: 'LOCK-001',
    })
    const firstClient = await getPool().connect()
    const secondClient = await getPool().connect()

    try {
      await firstClient.query('BEGIN')
      await secondClient.query('BEGIN')

      const firstTracking = new TrackingService(
        fixture.tenant.id,
        firstClient,
      )
      const secondTracking = new TrackingService(
        fixture.tenant.id,
        secondClient,
      )

      await firstTracking.validateAndLockSerials({
        variantId: fixture.first.defaultVariantId,
        baseQty: '1',
        serialIds: [serialId],
      })

      const competing = secondTracking.validateAndLockSerials({
        variantId: fixture.first.defaultVariantId,
        baseQty: '1',
        serialIds: [serialId],
      })

      await new Promise((resolve) => setTimeout(resolve, 25))
      await firstClient.query(
        `UPDATE inventory_serials
         SET status = 'SOLD', updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [fixture.tenant.id, serialId],
      )
      await firstClient.query('COMMIT')

      await expect(competing).rejects.toThrow(
        'Serial is unavailable for this Variant',
      )
      await secondClient.query('ROLLBACK')
    } finally {
      await firstClient.query('ROLLBACK').catch(() => undefined)
      await secondClient.query('ROLLBACK').catch(() => undefined)
      firstClient.release()
      secondClient.release()
    }
  })

  it('keeps a warranty snapshot unchanged after the Product warranty policy changes', async () => {
    const fixture = await createTrackingFixture('Warranty Snapshot')
    const tracking = new TrackingService(
      fixture.tenant.id,
      getPool(),
    )
    const salesLineId = await insertSalesLine({
      tenantId: fixture.tenant.id,
      userId: fixture.owner.id,
      variantId: fixture.first.defaultVariantId,
    })

    await tracking.replaceWarrantyPolicy(
      fixture.first.id,
      {
        enabled: true,
        durationValue: 12,
        durationUnit: 'MONTH',
        provider: 'SherHisab Shop',
        text: 'Battery replacement warranty',
      },
    )

    const snapshot = await tracking.createWarrantySnapshot({
      productId: fixture.first.id,
      salesLineId,
      serialId: null,
      startsOn: '2026-09-24',
    })

    expect(snapshot).toMatchObject({
      durationValue: 12,
      durationUnit: 'MONTH',
      provider: 'SherHisab Shop',
      text: 'Battery replacement warranty',
      startsOn: '2026-09-24',
      expiresOn: '2027-09-24',
    })

    await tracking.replaceWarrantyPolicy(
      fixture.first.id,
      {
        enabled: true,
        durationValue: 6,
        durationUnit: 'MONTH',
        provider: 'Changed Provider',
        text: 'Changed policy text',
      },
    )

    const stored = await tracking.listWarrantySnapshots(
      salesLineId,
    )

    expect(stored).toEqual([
      expect.objectContaining({
        id: snapshot.id,
        durationValue: 12,
        durationUnit: 'MONTH',
        provider: 'SherHisab Shop',
        text: 'Battery replacement warranty',
        startsOn: '2026-09-24',
        expiresOn: '2027-09-24',
      }),
    ])
  })
})


describe.skipIf(!hasDatabase)('batch expiry tracking', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('lists only unexpired batches in FEFO order', async () => {
    const fixture = await createTrackingFixture('Batch FEFO')

    await getPool().query(
      `UPDATE products
       SET tracking_mode = 'BATCH_EXPIRY',
           allocation_policy = 'FEFO'
       WHERE tenant_id = $1 AND id = $2`,
      [fixture.tenant.id, fixture.first.id],
    )

    const insertLot = async (input: {
      batchCode: string
      receivedOn: string
      expiresOn: string
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
         VALUES ($1,$2,'ADJUSTMENT',$3,1000,1500,5,5,$4,$5)
         RETURNING id`,
        [
          fixture.tenant.id,
          fixture.first.defaultVariantId,
          input.receivedOn,
          input.batchCode,
          input.expiresOn,
        ],
      )

      const id = result.rows[0]?.id
      if (!id) {
        throw new Error('Failed to create batch fixture')
      }
      return id
    }

    const laterExpiry = await insertLot({
      batchCode: 'BATCH-LATER',
      receivedOn: '2026-01-01',
      expiresOn: '2027-01-01',
    })
    const earlierExpiry = await insertLot({
      batchCode: 'BATCH-EARLIER',
      receivedOn: '2026-06-01',
      expiresOn: '2026-10-15',
    })
    await insertLot({
      batchCode: 'BATCH-EXPIRED',
      receivedOn: '2025-12-01',
      expiresOn: '2026-09-20',
    })

    const batches = await new TrackingService(
      fixture.tenant.id,
      getPool(),
    ).listSellableBatches(
      fixture.first.defaultVariantId,
      '2026-09-24',
    )

    expect(
      batches.map((batch) => ({
        id: batch.id,
        batchCode: batch.batchCode,
        expiresOn: batch.expiresOn,
      })),
    ).toEqual([
      {
        id: earlierExpiry,
        batchCode: 'BATCH-EARLIER',
        expiresOn: '2026-10-15',
      },
      {
        id: laterExpiry,
        batchCode: 'BATCH-LATER',
        expiresOn: '2027-01-01',
      },
    ])
  })
})


describe.skipIf(!hasDatabase)('product capture fields', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('validates typed capture definitions and select options', async () => {
    const fixture = await createTrackingFixture('Capture Definitions')
    const tracking = new TrackingService(
      fixture.tenant.id,
      getPool(),
    )

    const definitions = await tracking.replaceCaptureFields(
      fixture.first.id,
      [
        {
          key: 'prescription_no',
          label: 'Prescription No',
          type: 'text',
          required: true,
        },
        {
          key: 'dosage_form',
          label: 'Dosage Form',
          type: 'select',
          selectOptions: ['Tablet', 'Syrup'],
          required: true,
        },
        {
          key: 'manufactured_on',
          label: 'Manufactured On',
          type: 'date',
          required: false,
        },
        {
          key: 'strength',
          label: 'Strength',
          type: 'number',
          required: false,
        },
      ],
    )

    expect(definitions).toEqual([
      expect.objectContaining({
        key: 'prescription_no',
        label: 'Prescription No',
        type: 'text',
        selectOptions: [],
        required: true,
        sortOrder: 0,
      }),
      expect.objectContaining({
        key: 'dosage_form',
        label: 'Dosage Form',
        type: 'select',
        selectOptions: ['Tablet', 'Syrup'],
        required: true,
        sortOrder: 1,
      }),
      expect.objectContaining({
        key: 'manufactured_on',
        type: 'date',
        selectOptions: [],
        sortOrder: 2,
      }),
      expect.objectContaining({
        key: 'strength',
        type: 'number',
        selectOptions: [],
        sortOrder: 3,
      }),
    ])

    await expect(
      tracking.replaceCaptureFields(fixture.first.id, [
        {
          key: 'invalid_select',
          label: 'Invalid Select',
          type: 'select',
          selectOptions: [],
          required: false,
        },
      ]),
    ).rejects.toThrow('Select capture fields require at least one option')

    await expect(
      tracking.replaceCaptureFields(fixture.first.id, [
        {
          key: 'invalid_text',
          label: 'Invalid Text',
          type: 'text',
          selectOptions: ['Not allowed'],
          required: false,
        },
      ]),
    ).rejects.toThrow(
      'Only select capture fields can define select options',
    )
  })

  it('stores immutable sale-line capture snapshots after Product definitions change', async () => {
    const fixture = await createTrackingFixture('Capture Snapshot')
    const tracking = new TrackingService(
      fixture.tenant.id,
      getPool(),
    )
    const definitions = await tracking.replaceCaptureFields(
      fixture.first.id,
      [
        {
          key: 'prescription_no',
          label: 'Prescription No',
          type: 'text',
          required: true,
        },
        {
          key: 'dosage_form',
          label: 'Dosage Form',
          type: 'select',
          selectOptions: ['Tablet', 'Syrup'],
          required: true,
        },
      ],
    )
    const salesLineId = await insertSalesLine({
      tenantId: fixture.tenant.id,
      userId: fixture.owner.id,
      variantId: fixture.first.defaultVariantId,
    })

    const created = await tracking.snapshotCaptureValues({
      productId: fixture.first.id,
      salesLineId,
      values: {
        prescription_no: 'RX-2026-001',
        dosage_form: 'Tablet',
      },
    })

    expect(created).toEqual([
      expect.objectContaining({
        definitionId: definitions[0]?.id,
        key: 'prescription_no',
        label: 'Prescription No',
        type: 'text',
        value: 'RX-2026-001',
      }),
      expect.objectContaining({
        definitionId: definitions[1]?.id,
        key: 'dosage_form',
        label: 'Dosage Form',
        type: 'select',
        value: 'Tablet',
      }),
    ])

    await tracking.replaceCaptureFields(fixture.first.id, [
      {
        key: 'prescription_no',
        label: 'Updated Prescription Label',
        type: 'text',
        required: true,
      },
      {
        key: 'dosage_form',
        label: 'Updated Dosage Label',
        type: 'select',
        selectOptions: ['Capsule'],
        required: true,
      },
    ])

    const stored =
      await tracking.listCaptureValueSnapshots(salesLineId)

    expect(stored).toEqual([
      expect.objectContaining({
        definitionId: definitions[0]?.id,
        key: 'prescription_no',
        label: 'Prescription No',
        type: 'text',
        value: 'RX-2026-001',
      }),
      expect.objectContaining({
        definitionId: definitions[1]?.id,
        key: 'dosage_form',
        label: 'Dosage Form',
        type: 'select',
        value: 'Tablet',
      }),
    ])
  })
})
