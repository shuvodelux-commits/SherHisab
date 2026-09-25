import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import {
  PosSettingsRepository,
  type PosSettingsRecord,
} from './pos-settings.repository'

export class PosSettingsService {
  private readonly repository: PosSettingsRepository

  constructor(
    private readonly tenantId: string,
    database: DatabaseClient = getPool(),
  ) {
    if (!tenantId.trim()) {
      throw new Error('Trusted tenant id is required')
    }

    this.repository = new PosSettingsRepository(database)
  }

  get(): Promise<PosSettingsRecord> {
    return this.repository.getOrCreate(this.tenantId)
  }
}
