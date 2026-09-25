import type { DatabaseClient } from '../../db/request-database'
import { CustomerRepository } from '../customers/customer.repository'
import { normalizePhone } from '../customers/customer.service'
import type { CustomerRecord } from '../customers/customer.types'
import {
  SalesConflictError,
  SalesValidationError,
} from './sales.errors'
import type { SaleCustomerInput } from './sales.types'

export interface CustomerSnapshot {
  selectedCustomerId: string | null
  name: string
  phone: string
  normalizedPhone: string
  guardianName: string
  address: string
}

export class CustomerResolutionService {
  private readonly repository: CustomerRepository

  constructor(
    private readonly tenantId: string,
    database: DatabaseClient,
  ) {
    this.repository = new CustomerRepository(database)
  }

  snapshot(input: SaleCustomerInput): CustomerSnapshot {
    const name = input.name.trim()
    const phone = input.phone.trim()
    if (!name) {
      throw new SalesValidationError('Customer name is required.')
    }
    if (!phone) {
      throw new SalesValidationError('Customer phone is required.')
    }

    return {
      selectedCustomerId: input.selectedCustomerId?.trim() || null,
      name,
      phone,
      normalizedPhone: normalizePhone(phone),
      guardianName: input.guardianName?.trim() ?? '',
      address: input.address?.trim() ?? '',
    }
  }

  async selected(
    snapshot: CustomerSnapshot,
  ): Promise<CustomerRecord | null> {
    if (!snapshot.selectedCustomerId) {
      return null
    }
    const customer = await this.repository.findActiveById(
      this.tenantId,
      snapshot.selectedCustomerId,
    )
    if (!customer) {
      throw new SalesValidationError(
        'Selected Customer was not found or is inactive.',
      )
    }
    return customer
  }

  private async phoneMatch(
    snapshot: CustomerSnapshot,
  ): Promise<CustomerRecord | null> {
    if (!snapshot.normalizedPhone) {
      return null
    }
    const matches = await this.repository.findActiveByNormalizedPhone(
      this.tenantId,
      snapshot.normalizedPhone,
    )
    if (matches.length > 1) {
      throw new SalesConflictError(
        'Multiple Customers match this Phone. Select the exact Customer.',
      )
    }
    return matches[0] ?? null
  }

  async existingForCredit(
    snapshot: CustomerSnapshot,
  ): Promise<CustomerRecord> {
    const selected = await this.selected(snapshot)
    if (selected) {
      return selected
    }
    const matched = await this.phoneMatch(snapshot)
    if (!matched) {
      throw new SalesValidationError(
        'Customer Credit requires an existing Customer.',
      )
    }
    return matched
  }

  async forReceivable(
    snapshot: CustomerSnapshot,
  ): Promise<CustomerRecord> {
    const selected = await this.selected(snapshot)
    if (selected) {
      return selected
    }
    const matched = await this.phoneMatch(snapshot)
    if (matched) {
      return matched
    }

    const customerCode =
      await this.repository.allocateCustomerCode(this.tenantId)
    return this.repository.insertCustomer({
      tenantId: this.tenantId,
      customerCode,
      name: snapshot.name,
      phone: snapshot.phone,
      normalizedPhone: snapshot.normalizedPhone,
      guardianName: snapshot.guardianName,
      address: snapshot.address,
    })
  }
}
