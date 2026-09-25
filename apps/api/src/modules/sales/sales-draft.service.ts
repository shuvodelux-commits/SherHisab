import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import Decimal from 'decimal.js'
import { PosRepository } from '../pos/pos.repository'
import { ConversionService } from '../products/conversion.service'
import type { ConversionProfileSnapshot } from '../products/conversion.types'
import { SalesDraftAccessError, SalesDraftVersionConflictError } from './sales-draft.errors'
import { SalesDraftRepository } from './sales-draft.repository'
import { SalesRepository } from './sales.repository'
import { SalesService } from './sales.service'
import { SalesConflictError } from './sales.errors'
import type { CommittedSale, CommitSaleInput } from './sales.types'
import type {
  SalesDraftInput,
  SalesDraftLineInput,
  SalesDraftPostInput,
  SalesDraftRecord,
} from './sales-draft.types'

function wholePaisa(raw: string, label: string): string {
  const value = raw.trim()
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative whole paisa amount`)
  }
  return BigInt(value).toString()
}

function validateSimpleQuantity(line: SalesDraftLineInput): void {
  if (line.quantityInput.kind !== 'SIMPLE') return
  let entered: Decimal
  let saved: Decimal
  try {
    entered = new Decimal(line.quantityInput.baseQty)
    saved = new Decimal(line.normalizedQuantitySnapshot.baseQty)
  } catch {
    throw new Error('Draft quantity snapshot is invalid')
  }
  if (!entered.isFinite() || entered.lte(0) || !saved.eq(entered)) {
    throw new Error('Draft quantity snapshot does not match the entered quantity')
  }
}

function normalizeState(input: SalesDraftInput): SalesDraftInput {
  input.lines.forEach(validateSimpleQuantity)
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

  async get(
    draftId: string,
    actorUserId: string,
    canManageAll = false,
  ): Promise<SalesDraftRecord> {
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
    this.requireAccess(draft, actorUserId, canManageAll)
    return draft
  }

  async listRecent(
    actorUserId: string,
    limit = 5,
    canManageAll = false,
  ): Promise<SalesDraftRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new Error('Recent Draft limit must be between 1 and 20')
    }

    const repository = new SalesDraftRepository(this.database)
    const userId = actorUserId.trim()
    if (!userId) {
      throw new Error('Actor user is required')
    }
    const ids = await repository.listRecentActiveIds(
      this.tenantId,
      userId,
      limit,
      canManageAll,
    )
    const drafts: SalesDraftRecord[] = []

    for (const id of ids) {
      const draft = await repository.findById(this.tenantId, id)
      if (draft?.status === 'ACTIVE') {
        drafts.push(draft)
      }
    }

    return drafts
  }

  async archive(
    actorUserId: string,
    draftId: string,
    expectedVersion: number,
    canManageAll = false,
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

    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const repository = new SalesDraftRepository(database)
        const current = await repository.findById(this.tenantId, id)

        if (!current) {
          throw new Error('Draft not found')
        }
        this.requireAccess(current, userId, canManageAll)
        if (current.version !== expectedVersion) {
          throw new SalesDraftVersionConflictError(current.version)
        }
        if (current.status !== 'ACTIVE') {
          throw new Error('Draft is not active')
        }

        const archived = await repository.archiveDraft({
          tenantId: this.tenantId,
          draftId: id,
          expectedVersion,
        })
        if (!archived) {
          const latest = await repository.findById(this.tenantId, id)
          if (latest) {
            throw new SalesDraftVersionConflictError(latest.version)
          }
          throw new Error('Draft not found')
        }

        await repository.insertAudit({
          tenantId: this.tenantId,
          draftId: id,
          version: archived.version,
          actorUserId: userId,
          state: {
            customer: current.customer,
            discountPaisa: current.discountPaisa,
            payments: current.payments,
            note: current.note,
            lines: current.lines,
          },
          action: 'ARCHIVED',
        })

        const loaded = await repository.findById(this.tenantId, id)
        if (!loaded) {
          throw new Error('Archived Draft disappeared')
        }
        return loaded
      },
    )
  }

  async update(
    actorUserId: string,
    draftId: string,
    expectedVersion: number,
    input: SalesDraftInput,
    canManageAll = false,
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
        const current = await repository.findById(this.tenantId, id)
        if (!current) {
          throw new Error('Draft not found')
        }
        this.requireAccess(current, userId, canManageAll)
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

        await repository.insertAudit({
          tenantId: this.tenantId,
          draftId: id,
          version: header.version,
          actorUserId: userId,
          state,
          action: 'UPDATED',
        })

        const loaded = await repository.findById(this.tenantId, id)
        if (!loaded) {
          throw new Error('Updated Draft disappeared')
        }
        return loaded
      },
    )
  }


  async post(
    actorUserId: string,
    draftId: string,
    expectedVersion: number,
    input: SalesDraftPostInput,
    canManageAll = false,
  ): Promise<CommittedSale> {
    const userId = actorUserId.trim()
    const id = draftId.trim()
    const operationId = input.operationId.trim().toLowerCase()

    if (!userId) {
      throw new Error('Actor user is required')
    }
    if (!id) {
      throw new Error('Draft id is required')
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      throw new Error('Expected Draft version must be a positive integer')
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        operationId,
      )
    ) {
      throw new Error('Operation ID must be a UUID')
    }

    try {
      return await withDatabaseTransaction(this.database, async (database) => {
        const repository = new SalesDraftRepository(database)
        // The row lock also serializes update, archive, and a second post.
        const draft = await repository.findById(this.tenantId, id, true)
        if (!draft) throw new Error('Draft not found')
        this.requireAccess(draft, userId, canManageAll)

        if (draft.status === 'POSTED') {
          if (draft.version !== expectedVersion) {
            throw new SalesDraftVersionConflictError(draft.version)
          }
          if (draft.postedOperationId !== operationId) {
            throw new SalesConflictError('Draft has already been posted with another operation.')
          }
          const salesRepository = new SalesRepository(database)
          const committed = await salesRepository.findCommittedSaleByOperationId(
            this.tenantId, operationId,
          )
          const source = await salesRepository.findDraftSourceByOperationId(
            this.tenantId, operationId,
          )
          if (
            !committed || committed.id !== draft.postedSaleId ||
            source?.id !== draft.id || source.version !== draft.version
          ) {
            throw new SalesConflictError(
              'Posted Draft sale identity is missing or ambiguous; retry cannot be verified.',
            )
          }
          return committed
        }

        if (draft.status !== 'ACTIVE') throw new Error('Draft is not active')
        if (draft.version !== expectedVersion) {
          throw new SalesDraftVersionConflictError(draft.version)
        }
        if (draft.postedOperationId !== null) {
          throw new SalesConflictError('Draft posting is already in progress.')
        }
        await this.validateConversionCompatibility(draft, database)

        const saleInput: CommitSaleInput = {
          operationId,
          businessDate: input.businessDate,
          customer: {
            ...(draft.customer.selectedCustomerId
              ? { selectedCustomerId: draft.customer.selectedCustomerId }
              : {}),
            name: draft.customer.name,
            phone: draft.customer.phone,
            guardianName: draft.customer.guardianName,
            address: draft.customer.address,
          },
          discountPaisa: draft.discountPaisa,
          payments: draft.payments.map((payment) => ({
            clientLineId: payment.clientLineId,
            method: payment.method,
            ...(payment.accountId ? { accountId: payment.accountId } : {}),
            amountPaisa: payment.amountPaisa,
            reference: payment.reference,
            note: payment.note,
          })),
          lines: draft.lines.map((line) => {
            if (
              line.pricingMode === 'MANUAL' &&
              line.manualUnitSellingPricePaisa === null
            ) {
              throw new Error('Manual Draft line is missing its selling price')
            }
            return {
              variantId: line.variantId,
              baseQty: line.quantityInput.kind === 'SIMPLE'
                ? line.quantityInput.baseQty
                : line.normalizedQuantitySnapshot.baseQty,
              ...(line.pricingMode === 'MANUAL'
                ? { manualUnitSellingPricePaisa: line.manualUnitSellingPricePaisa! }
                : {}),
              ...(line.shortageResolution === null
                ? {}
                : { shortageResolution: line.shortageResolution }),
            }
          }),
          sourceDraft: { id: draft.id, version: draft.version },
        }

        // SalesService uses this same transaction; its stock and accounting
        // writes cannot commit separately from the Draft status and audit.
        const sale = await new SalesService(database, true).commitSale(
          this.tenantId, userId, input.canOverrideSellingPrice, saleInput,
        )
        const marked = await repository.markPosted({
          tenantId: this.tenantId,
          draftId: id,
          expectedVersion,
          operationId,
          saleId: sale.id,
        })
        if (!marked) throw new Error('Draft could not be linked to its posted Invoice')
        await repository.insertAudit({
          tenantId: this.tenantId,
          draftId: id,
          version: draft.version,
          actorUserId: userId,
          state: {
            customer: draft.customer,
            discountPaisa: draft.discountPaisa,
            payments: draft.payments,
            note: draft.note,
            lines: draft.lines,
          },
          action: 'POSTED',
        })
        return sale
      })
    } catch (error) {
      // A simultaneous post of a different Draft may win operation_id's
      // unique index while this transaction waits for its sale to commit.
      if (
        typeof error === 'object' && error !== null &&
        'code' in error && error.code === '23505'
      ) {
        const source = await new SalesRepository(this.database)
          .findDraftSourceByOperationId(this.tenantId, operationId)
        if (source && (source.id !== id || source.version !== expectedVersion)) {
          throw new SalesConflictError('Operation ID belongs to a different Draft.')
        }
      }
      throw error
    }
  }

  private requireAccess(
    draft: SalesDraftRecord,
    actorUserId: string,
    canManageAll: boolean,
  ): void {
    if (!actorUserId.trim()) {
      throw new Error('Actor user is required')
    }
    if (draft.ownerUserId !== actorUserId && !canManageAll) {
      throw new SalesDraftAccessError()
    }
  }

  private async validateConversionCompatibility(
    draft: SalesDraftRecord,
    database: DatabaseClient,
  ): Promise<void> {
    const conversions = new ConversionService(
      this.tenantId,
      database,
    )
    const products = new PosRepository(database)

    for (const line of draft.lines) {
      if (line.quantityInput.kind === 'SIMPLE') {
        validateSimpleQuantity(line)
        continue
      }
      const savedProfile = line.normalizedQuantitySnapshot
        .snapshot as ConversionProfileSnapshot | null
      if (!savedProfile) {
        throw new Error('Draft conversion snapshot is missing; reload the Draft before posting.')
      }

      const variant = await products.findVariantContext(
        this.tenantId,
        line.variantId,
      )
      if (!variant || savedProfile.productId !== variant.productId) {
        throw new Error('Draft conversion snapshot does not match this Product Variant.')
      }

      const activeProfile = await conversions.getActiveProfile(
        variant.productId,
      )
      if (!activeProfile) {
        throw new Error('Draft conversion profile is no longer compatible with this Product.')
      }

      let currentQuantity
      try {
        currentQuantity = await conversions.normalize({
          kind: 'COMPONENTS',
          profileId: activeProfile.id,
          profileVersion: activeProfile.version,
          components: line.quantityInput.components,
        })
      } catch {
        throw new Error('Draft conversion components are no longer compatible with this Product.')
      }

      if (
        !new Decimal(currentQuantity.baseQty).eq(
          line.normalizedQuantitySnapshot.baseQty,
        )
      ) {
        throw new Error('Draft conversion changed; reload the Draft and review its quantity before posting.')
      }
    }
  }

}
