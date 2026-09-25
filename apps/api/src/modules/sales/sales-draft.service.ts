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
import type { CommittedSale, CommitSaleInput } from './sales.types'
import type {
  SalesDraftInput,
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

    const repository = new SalesDraftRepository(this.database)
    let draft = await repository.findById(this.tenantId, id)
    if (!draft) {
      throw new Error('Draft not found')
    }
    this.requireAccess(draft, userId, canManageAll)

    if (draft.status === 'POSTED') {
      if (draft.postedOperationId !== operationId) {
        throw new Error('Draft has already been posted')
      }
      const committed = await new SalesRepository(
        this.database,
      ).findCommittedSaleByOperationId(
        this.tenantId,
        operationId,
      )
      if (!committed) {
        throw new Error('Posted Draft Invoice was not found')
      }
      return committed
    }

    if (draft.status !== 'ACTIVE') {
      throw new Error('Draft is not active')
    }
    if (draft.version !== expectedVersion) {
      throw new SalesDraftVersionConflictError(draft.version)
    }

    await this.validateConversionCompatibility(draft)

    const claimed = await repository.claimPost({
      tenantId: this.tenantId,
      draftId: id,
      expectedVersion,
      operationId,
    })

    if (!claimed) {
      draft = await repository.findById(this.tenantId, id)
      if (!draft) {
        throw new Error('Draft not found')
      }
      this.requireAccess(draft, userId, canManageAll)
      if (
        draft.status === 'POSTED' &&
        draft.postedOperationId === operationId
      ) {
        const committed = await new SalesRepository(
          this.database,
        ).findCommittedSaleByOperationId(
          this.tenantId,
          operationId,
        )
        if (!committed) {
          throw new Error('Posted Draft Invoice was not found')
        }
        return committed
      }
      if (draft.version !== expectedVersion) {
        throw new SalesDraftVersionConflictError(draft.version)
      }
      throw new Error(
        'Draft posting is already in progress with another operation',
      )
    }

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
        ...(payment.accountId
          ? { accountId: payment.accountId }
          : {}),
        amountPaisa: payment.amountPaisa,
        reference: payment.reference,
        note: payment.note,
      })),
      lines: draft.lines.map((line) => {
        if (
          line.pricingMode === 'MANUAL' &&
          line.manualUnitSellingPricePaisa === null
        ) {
          throw new Error(
            'Manual Draft line is missing its selling price',
          )
        }

        return {
          variantId: line.variantId,
          baseQty: line.normalizedQuantitySnapshot.baseQty,
          ...(line.pricingMode === 'MANUAL'
            ? {
                manualUnitSellingPricePaisa:
                  line.manualUnitSellingPricePaisa!,
              }
            : {}),
          ...(line.shortageResolution === null
            ? {}
            : {
                shortageResolution: line.shortageResolution,
              }),
        }
      }),
      sourceDraft: {
        id: draft.id,
        version: draft.version,
      },
    }

    let sale: CommittedSale
    try {
      sale = await new SalesService(this.database).commitSale(
        this.tenantId,
        userId,
        input.canOverrideSellingPrice,
        saleInput,
      )
    } catch (error) {
      const committed = await new SalesRepository(
        this.database,
      ).findCommittedSaleByOperationId(
        this.tenantId,
        operationId,
      )
      if (committed) {
        sale = committed
      } else {
        await repository.clearPostClaim({
          tenantId: this.tenantId,
          draftId: id,
          expectedVersion,
          operationId,
        })
        throw error
      }
    }

    await withDatabaseTransaction(this.database, async (database) => {
      const postingRepository = new SalesDraftRepository(database)
      const marked = await postingRepository.markPosted({
        tenantId: this.tenantId,
        draftId: id,
        expectedVersion,
        operationId,
        saleId: sale.id,
      })

      if (!marked) {
        const current = await postingRepository.findById(this.tenantId, id)
        if (
          current?.status !== 'POSTED' ||
          current.postedOperationId !== operationId ||
          current.postedSaleId !== sale.id
        ) {
          throw new Error('Draft could not be linked to its posted Invoice')
        }
        return
      }

      await postingRepository.insertAudit({
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
    })

    return sale
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
  ): Promise<void> {
    const conversions = new ConversionService(
      this.tenantId,
      this.database,
    )
    const products = new PosRepository(this.database)

    for (const line of draft.lines) {
      if (line.quantityInput.kind !== 'COMPONENTS') continue
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
