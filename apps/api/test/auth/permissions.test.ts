import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS,
  can,
  resolvePermissions,
  type PermissionKey,
} from '../../src/modules/auth/permissions'

describe('permission resolution', () => {
  it('gives Owner and Admin both privileged selling-price permissions', () => {
    expect(resolvePermissions('OWNER', [])).toEqual(PERMISSIONS)
    expect(resolvePermissions('ADMIN', [])).toEqual(PERMISSIONS)
  })

  it('gives Staff only explicit tenant-scoped grants', () => {
    const grant: PermissionKey = 'SALES_OVERRIDE_SELLING_PRICE'

    expect(resolvePermissions('STAFF', [])).toEqual([])
    expect(resolvePermissions('STAFF', [grant, grant])).toEqual([grant])
    expect(can('STAFF', [grant], grant)).toBe(true)
    expect(
      can(
        'STAFF',
        [grant],
        'INVENTORY_EDIT_LOT_SELLING_PRICE',
      ),
    ).toBe(false)
  })
})
