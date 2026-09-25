import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import { VendorRepository } from './vendor.repository'
import type {
  CreateVendorInput,
  VendorRecord,
} from './vendor.types'

export class VendorService {
  private readonly repository: VendorRepository

  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId.trim()) {
      throw new Error('Trusted tenant id is required')
    }

    this.repository = new VendorRepository(database)
  }

  async create(input: CreateVendorInput): Promise<VendorRecord> {
    const name = input.name.trim()
    if (!name) {
      throw new Error('Vendor name is required')
    }

    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const repository = new VendorRepository(database)
        const vendorCode =
          await repository.allocateVendorCode(this.tenantId)

        return repository.insertVendor({
          tenantId: this.tenantId,
          vendorCode,
          name,
          phone: input.phone?.trim() ?? '',
          address: input.address?.trim() ?? '',
        })
      },
    )
  }

  search(rawQuery: string, limit = 20): Promise<VendorRecord[]> {
    const query = rawQuery.trim()
    if (!query) {
      return Promise.resolve([])
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('Vendor search limit must be between 1 and 50')
    }

    return this.repository.search(this.tenantId, query, limit)
  }

  async get(vendorId: string): Promise<VendorRecord> {
    const vendor = await this.repository.findById(
      this.tenantId,
      vendorId.trim(),
    )
    if (!vendor) {
      throw new Error('Vendor not found')
    }

    return vendor
  }
}
