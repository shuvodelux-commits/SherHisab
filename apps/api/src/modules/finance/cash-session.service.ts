import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import { FinanceRepository } from './finance.repository'
import type {
  CashSessionRecord,
  CloseCashSessionInput,
  OpenCashSessionInput,
} from './finance.types'

function nonNegativePaisa(value: string, label: string): string {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a non-negative whole paisa amount`)
  }

  return BigInt(normalized).toString()
}

export class CashSessionService {
  private readonly repository: FinanceRepository

  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId.trim()) {
      throw new Error('Trusted tenant id is required')
    }

    this.repository = new FinanceRepository(database)
  }

  async open(input: OpenCashSessionInput): Promise<CashSessionRecord> {
    const openingCashPaisa = nonNegativePaisa(
      input.openingCashPaisa,
      'Opening cash',
    )
    const actorUserId = input.actorUserId.trim()
    if (!actorUserId) {
      throw new Error('Actor user is required')
    }

    return withDatabaseTransaction(this.database, async (database) => {
      const repository = new FinanceRepository(database)
      if (await repository.findActiveCashSession(this.tenantId, true)) {
        throw new Error('A cash session is already open')
      }

      try {
        return await repository.createCashSession({
          tenantId: this.tenantId,
          openingCashPaisa,
          actorUserId,
          notes: input.notes?.trim() ?? '',
        })
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505'
        ) {
          throw new Error('A cash session is already open', {
            cause: error,
          })
        }
        throw error
      }
    })
  }

  getActive(): Promise<CashSessionRecord | null> {
    return this.repository.findActiveCashSession(this.tenantId)
  }

  async close(input: CloseCashSessionInput): Promise<CashSessionRecord> {
    const countedCashPaisa = nonNegativePaisa(
      input.countedCashPaisa,
      'Counted cash',
    )
    const actorUserId = input.actorUserId.trim()
    if (!actorUserId) {
      throw new Error('Actor user is required')
    }

    return withDatabaseTransaction(this.database, async (database) => {
      const repository = new FinanceRepository(database)
      const active = await repository.findActiveCashSession(
        this.tenantId,
        true,
      )
      if (!active) {
        throw new Error('No cash session is open')
      }

      const expectedCashPaisa = active.expectedCashPaisa
      const variancePaisa = (
        BigInt(countedCashPaisa) - BigInt(expectedCashPaisa)
      ).toString()

      return repository.closeCashSession({
        tenantId: this.tenantId,
        sessionId: active.id,
        expectedCashPaisa,
        countedCashPaisa,
        variancePaisa,
        actorUserId,
        notes: input.notes?.trim() ?? active.notes,
      })
    })
  }
}
