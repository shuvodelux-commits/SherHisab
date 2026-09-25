import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import { SalesDraftVersionConflictError } from './sales-draft.errors'
import { SalesDraftRepository } from './sales-draft.repository'
import type {
  SalesDraftInput,
  SalesDraftRecord,
} from './sales-draft.types'

function wholePaisa(raw: string, label: string): string {
  const value = raw.trim()
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative whole paisa amount`)
  }
  return BigInt(value).toString()
}

function normalizeState(input: SalesDraftInput): SalesDraftInput {
  return {
    customer: {
      selectedCustomerId:
        input.customer.selectedCustomerId?.trim() || null,
      name: input.customer.name.trim(),
      phone: input.customer.phone.trim(),
      guardianName: input.customer.guardianName.trim(),
      address: input.customer.address.trim(),
    },
    discountPaisa: wholePaisa(input.discountPaisa, 'Discount'),
    payments: input.payments.map((payment) => ({
      clientLineId: payment.clientLineId.trim(),
      method: payment.method,
      accountId: payment.accountId?.trim() || null,
      amountPaisa: wholePaisa(payment.amountPaisa, 'Payment amount'),
      reference: payment.reference.trim(),
      note: payment.note.trim(),
    })),
    note: input.note.trim(),
    lines: input.lines.map((line) => ({
      ...line,
      variantId: line.variantId.trim(),
      manualUnitSellingPricePaisa:
        line.manualUnitSellingPricePaisa === null
          ? null
          : wholePaisa(
              line.manualUnitSellingPricePaisa,
              'Manual selling price',
            ),
      shortageResolution:
        line.shortageResolution?.type === 'VENDOR'
          ? {
              type: 'VENDOR' as const,
              vendorId: line.shortageResolution.vendorId.trim(),
              unitCostPaisa: wholePaisa(
                line.shortageResolution.unitCostPaisa,
                'Vendor unit cost',
              ),
            }
          : line.shortageResolution,
      serialIds: line.serialIds.map((id) => id.trim()),
      captureValues: { ...line.captureValues },
    })),
  }
}

export class SalesDraftService {
  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId.trim()) {
      throw new Error('Trusted tenant id is required')
    }
  }

  async create(
    actorUserId: string,
    input: SalesDraftInput,
  ): Promise<SalesDraftRecord> {
    const userId = actorUserId.trim()
    if (!userId) {
      throw new Error('Actor user is required')
    }
    const state = normalizeState(input)

    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const repository = new SalesDraftRepository(database)
        const draftNumber =
          await repository.allocateDraftNumber(this.tenantId)
        const header = await repository.insertDraft({
          tenantId: this.tenantId,
          draftNumber,
          ownerUserId: userId,
          state,
        })

        for (let index = 0; index < state.lines.length; index += 1) {
          await repository.insertLine({
            tenantId: this.tenantId,
            draftId: header.id,
            sortOrder: index,
            line: state.lines[index]!,
          })
        }

        await repository.insertAudit({
          tenantId: this.tenantId,
          draftId: header.id,
          version: header.version,
          actorUserId: userId,
          state,
        })

        return repository.toCreatedRecord(
          this.tenantId,
          header,
          state,
        )
      },
    )
  }

  async get(draftId: string): Promise<SalesDraftRecord> {
    const id = draftId.trim()
    if (!id) {
      throw new Error('Draft id is required')
    }
    const draft = await new SalesDraftRepository(
      this.database,
    ).findById(this.tenantId, id)
    if (!draft) {
      throw new Error('Draft not found')
    }
    return draft
  }

  async update(
    actorUserId: string,
    draftId: string,
    expectedVersion: number,
    input: SalesDraftInput,
  ): Promise<SalesDraftRecord> {
    const userId = actorUserId.trim()
    const id = draftId.trim()
    if (!userId) {
      throw new Error('Actor user is required')
    }
    if (!id) {
      throw new Error('Draft id is required')
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      throw new Error('Expected Draft version must be a positive integer')
    }
    const state = normalizeState(input)

    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const repository = new SalesDraftRepository(database)
        const header = await repository.replaceState({
          tenantId: this.tenantId,
          draftId: id,
          expectedVersion,
          state,
        })
        if (!header) {
          const current = await repository.findById(
            this.tenantId,
            id,
          )
          if (current?.status === 'ACTIVE') {
            throw new SalesDraftVersionConflictError(
              current.version,
            )
          }
          throw new Error('Draft not found or is not active')
        }

        await repository.deleteLines(this.tenantId, id)
        for (let index = 0; index < state.lines.length; index += 1) {
          await repository.insertLine({
            tenantId: this.tenantId,
            draftId: id,
            sortOrder: index,
            line: state.lines[index]!,
          })
        }

        const loaded = await repository.findById(this.tenantId, id)
        if (!loaded) {
          throw new Error('Updated Draft disappeared')
        }
        return loaded
      },
    )
  }

}
