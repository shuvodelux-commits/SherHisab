import { TenantRepository } from './tenant.repository'
import type { CreateTenantInput, Tenant } from './tenant.types'

export class TenantService {
  constructor(
    private readonly tenantId: string,
    private readonly repository: TenantRepository = new TenantRepository(),
  ) {
    if (!tenantId) {
      throw new Error('Trusted tenant id is required')
    }
  }

  async getCurrentTenant(): Promise<Tenant> {
    const tenant = await this.repository.findById(this.tenantId)

    if (!tenant) {
      throw new Error('Tenant not found')
    }

    return tenant
  }

  static async createTenant(
    input: CreateTenantInput,
    repository: TenantRepository = new TenantRepository(),
  ): Promise<Tenant> {
    const name = input.name.trim()
    const slug = input.slug.trim().toLowerCase()

    if (!name || !slug) {
      throw new Error('Tenant name and slug are required')
    }

    return repository.create({ name, slug })
  }
}
