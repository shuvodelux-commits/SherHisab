import type {
  PermissionKey,
  UserRole,
} from '../modules/auth/permissions'

export interface AppEnv {
  Bindings: {
    HYPERDRIVE?: {
      connectionString: string
    }
  }
  Variables: {
    userId: string
    tenantId: string
    role: UserRole
    permissions: PermissionKey[]
  }
}
