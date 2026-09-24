import type { DatabaseClient } from '../../db/request-database'
import { buildFifoLineQuote } from './sales-allocation'
import { SalesRepository } from './sales.repository'
import type { FifoLineQuote } from './sales.types'

export class SalesPricingService {
  private readonly repository: SalesRepository

  constructor(database: DatabaseClient) {
    this.repository = new SalesRepository(database)
  }

  async quoteFifoLine(
    tenantId: string,
    variantId: string,
    baseQty: string,
  ): Promise<FifoLineQuote> {
    const lots = await this.repository.listAvailableFifoLots(
      tenantId,
      variantId,
    )

    return buildFifoLineQuote(variantId, baseQty, lots)
  }
}
