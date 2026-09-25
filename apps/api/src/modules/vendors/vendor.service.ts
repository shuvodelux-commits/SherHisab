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
