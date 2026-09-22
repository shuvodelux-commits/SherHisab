export interface Tenant {
  id: string
  name: string
  slug: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateTenantInput {
  name: string
  slug: string
}
