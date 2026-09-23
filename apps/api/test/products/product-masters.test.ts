import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { closePool, getPool } from '../../src/db/pool'
import { ProductMasterService } from '../../src/modules/products/product-master.service'
import {
  cleanupProductTestTenants,
  createProductTestTenant,
} from './product-test-helpers'

const hasDatabase = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabase)('product category and unit masters', () => {
  afterEach(async () => {
    await cleanupProductTestTenants()
  })

  afterAll(async () => {
    await closePool()
  })

  it('keeps categories and units scoped to the trusted tenant', async () => {
    const tenantA = await createProductTestTenant('Master Tenant A')
    const tenantB = await createProductTestTenant('Master Tenant B')
    const serviceA = new ProductMasterService(tenantA.id, getPool())
    const serviceB = new ProductMasterService(tenantB.id, getPool())

    await serviceA.createCategory('Hardware')
    await serviceA.createUnit({ name: 'Box', symbol: 'box' })
    await serviceB.createCategory('Medicine')
    await serviceB.createUnit({ name: 'Strip', symbol: 'strip' })

    const categoriesA = await serviceA.listCategories()
    const unitsA = await serviceA.listUnits()

    expect(categoriesA.map((item) => item.name)).toEqual(['Hardware'])
    expect(categoriesA.some((item) => item.name === 'Medicine')).toBe(false)
    expect(unitsA.some((item) => item.name === 'Box')).toBe(true)
    expect(unitsA.some((item) => item.name === 'Strip')).toBe(false)
  })

  it('rejects active category names case-insensitively', async () => {
    const tenant = await createProductTestTenant('Category Duplicate Tenant')
    const service = new ProductMasterService(tenant.id, getPool())

    await service.createCategory('Pipe')

    await expect(service.createCategory('  pipe  ')).rejects.toThrow(
      'A category with this name already exists.',
    )
  })

  it('allows an archived category name to be recreated', async () => {
    const tenant = await createProductTestTenant('Category Archive Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const original = await service.createCategory('Pipe')

    await service.setCategoryActive(original.id, false)
    const replacement = await service.createCategory('pipe')

    expect(replacement.id).not.toBe(original.id)
    expect(replacement.isActive).toBe(true)
    expect((await service.listCategories()).map((item) => item.id)).toEqual([
      replacement.id,
    ])
    expect(await service.listCategories(true)).toHaveLength(2)
  })

  it('rejects active unit names case-insensitively', async () => {
    const tenant = await createProductTestTenant('Unit Duplicate Tenant')
    const service = new ProductMasterService(tenant.id, getPool())

    await service.createUnit({ name: 'Kilogram', symbol: 'kg' })

    await expect(
      service.createUnit({ name: ' kilogram ', symbol: 'KG' }),
    ).rejects.toThrow('A unit with this name already exists.')
  })

  it('allows an archived unit name to be recreated', async () => {
    const tenant = await createProductTestTenant('Unit Archive Tenant')
    const service = new ProductMasterService(tenant.id, getPool())
    const original = await service.createUnit({ name: 'Roll', symbol: 'roll' })

    await service.setUnitActive(original.id, false)
    const replacement = await service.createUnit({
      name: 'roll',
      symbol: 'rl',
    })

    expect(replacement.id).not.toBe(original.id)
    expect(replacement.isActive).toBe(true)
    expect((await service.listUnits()).some((item) => item.id === original.id)).toBe(
      false,
    )
    expect((await service.listUnits(true)).some((item) => item.id === original.id)).toBe(
      true,
    )
  })

  it('rejects empty category and unit names', async () => {
    const tenant = await createProductTestTenant('Master Validation Tenant')
    const service = new ProductMasterService(tenant.id, getPool())

    await expect(service.createCategory('   ')).rejects.toThrow(
      'Category name is required',
    )
    await expect(service.createUnit({ name: '   ' })).rejects.toThrow(
      'Unit name is required',
    )
  })
})
