export interface AppEnv {
  Bindings: {
    HYPERDRIVE?: {
      connectionString: string
    }
  }
  Variables: {
    userId: string
    tenantId: string
  }
}
