import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS,
  can,
  resolvePermissions,
  type PermissionKey,
} from '../../src/modules/auth/permissions'

describe('permission resolution', () => {
  it('gives Owner and Admin every mature POS permission', () => {
    const maturePosPermissions: PermissionKey[] = [
      'POS_VIEW',
      'POS_SELL',
      'SALES_VIEW',
      'SALES_EDIT',
      'SALES_RETURN',
      'POS_COST_VIEW',
      'SALES_TEMPLATE_VIEW',
      'SALES_TEMPLATE_MANAGE',
      'SALES_BACKDATE',
    ]

    expect(PERMISSIONS).toEqual(
      expect.arrayContaining(maturePosPermissions),
    )
    expect(resolvePermissions('OWNER', [])).toEqual(PERMISSIONS)
    expect(resolvePermissions('ADMIN', [])).toEqual(PERMISSIONS)
  })

  it('gives Staff only explicit tenant-scoped grants', () => {
    const grant: PermissionKey = 'POS_SELL'

    expect(resolvePermissions('STAFF', [])).toEqual([])
    expect(resolvePermissions('STAFF', [grant, grant])).toEqual([grant])
    expect(can('STAFF', [grant], grant)).toBe(true)
    expect(
      can(
        'STAFF',
        [grant],
        'SALES_EDIT',
      ),
    ).toBe(false)
  })
})
