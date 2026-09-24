export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF'

export type PermissionKey =
  | 'SALES_OVERRIDE_SELLING_PRICE'
  | 'INVENTORY_EDIT_LOT_SELLING_PRICE'

export const PERMISSIONS: PermissionKey[] = [
  'SALES_OVERRIDE_SELLING_PRICE',
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
