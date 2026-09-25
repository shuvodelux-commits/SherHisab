export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF'

export type PermissionKey =
  | 'POS_VIEW'
  | 'POS_SELL'
  | 'SALES_VIEW'
  | 'SALES_EDIT'
  | 'SALES_RETURN'
  | 'SALES_OVERRIDE_SELLING_PRICE'
  | 'POS_COST_VIEW'
  | 'SALES_TEMPLATE_VIEW'
  | 'SALES_TEMPLATE_MANAGE'
  | 'SALES_BACKDATE'
  | 'INVENTORY_EDIT_LOT_SELLING_PRICE'

export const PERMISSIONS: PermissionKey[] = [
  'POS_VIEW',
  'POS_SELL',
  'SALES_VIEW',
  'SALES_EDIT',
  'SALES_RETURN',
  'SALES_OVERRIDE_SELLING_PRICE',
  'POS_COST_VIEW',
  'SALES_TEMPLATE_VIEW',
  'SALES_TEMPLATE_MANAGE',
  'SALES_BACKDATE',
  'INVENTORY_EDIT_LOT_SELLING_PRICE',
]

export function resolvePermissions(
  role: UserRole,
  grants: PermissionKey[],
): PermissionKey[] {
  if (role === 'OWNER' || role === 'ADMIN') {
    return [...PERMISSIONS]
  }

  return [...new Set(grants)]
}

export function can(
  role: UserRole,
  grants: PermissionKey[],
  permission: PermissionKey,
): boolean {
  return resolvePermissions(role, grants).includes(permission)
}
