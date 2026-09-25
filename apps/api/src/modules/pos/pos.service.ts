import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { PosRepository } from './pos.repository'
import type {
  PosProductSearchOptions,
  PosProductSearchResult,
} from './pos.types'

export class PosService {
  private readonly repository: PosRepository

  constructor(
    private readonly tenantId: string,
    database: DatabaseClient = getPool(),
  ) {
    if (!tenantId.trim()) {
      throw new Error('Trusted tenant id is required')
    }

    this.repository = new PosRepository(database)
  }

  async searchProducts(
    rawQuery: string,
    options: PosProductSearchOptions = {},
  ): Promise<PosProductSearchResult[]> {
    const query = rawQuery.trim()
    if (!query) {
      return []
    }

    const limit = options.limit ?? 20
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('POS search limit must be between 1 and 50')
    }

    return await this.repository.searchProducts(
      this.tenantId,
      query,
      limit,
    )
  }
}
