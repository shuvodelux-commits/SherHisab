import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import { CustomerRepository } from './customer.repository'
import type {
  CreateCustomerInput,
  CustomerPhoneResolution,
  CustomerRecord,
} from './customer.types'

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')

  if (
    digits.length === 13 &&
    digits.startsWith('8801')
  ) {
    return `0${digits.slice(3)}`
  }

  return digits
}

export class CustomerService {
  private readonly repository: CustomerRepository

  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId.trim()) {
      throw new Error('Trusted tenant id is required')
    }

    this.repository = new CustomerRepository(database)
  }

  async create(input: CreateCustomerInput): Promise<CustomerRecord> {
    const name = input.name.trim()
    if (!name) {
      throw new Error('Customer name is required')
    }

    const phone = input.phone?.trim() ?? ''
    const normalizedPhone = normalizePhone(phone)

    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const repository = new CustomerRepository(database)
        const customerCode =
          await repository.allocateCustomerCode(this.tenantId)

        return repository.insertCustomer({
          tenantId: this.tenantId,
          customerCode,
          name,
          phone,
          normalizedPhone,
          guardianName: input.guardianName?.trim() ?? '',
          address: input.address?.trim() ?? '',
        })
      },
    )
  }

  async resolveByPhone(raw: string): Promise<CustomerPhoneResolution> {
    const normalizedPhone = normalizePhone(raw)
    if (!normalizedPhone) {
      return {
        kind: 'NONE',
        normalizedPhone,
        customer: null,
        matches: [],
      }
    }

    const matches =
      await this.repository.findActiveByNormalizedPhone(
        this.tenantId,
        normalizedPhone,
      )

    if (matches.length === 0) {
      return {
        kind: 'NONE',
        normalizedPhone,
        customer: null,
        matches: [],
      }
    }

    if (matches.length === 1) {
      return {
        kind: 'UNIQUE',
        normalizedPhone,
        customer: matches[0]!,
        matches,
      }
    }

    return {
      kind: 'AMBIGUOUS',
      normalizedPhone,
      customer: null,
      matches,
    }
  }

  search(query: string): Promise<CustomerRecord[]> {
    const trimmed = query.trim()
    if (!trimmed) {
      return Promise.resolve([])
    }

    return this.repository.search(
      this.tenantId,
      trimmed,
      normalizePhone(trimmed),
    )
  }

  async balance(customerId: string): Promise<string> {
    const normalizedId = customerId.trim()
    if (!normalizedId) {
      throw new Error('Customer is required')
    }

    const balance = await this.repository.balance(
      this.tenantId,
      normalizedId,
    )
    if (balance === null) {
      throw new Error('Customer not found')
    }

    return balance
  }
}
