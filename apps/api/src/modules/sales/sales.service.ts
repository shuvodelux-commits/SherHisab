import Decimal from 'decimal.js'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import { InventoryRepository } from '../products/inventory.repository'
import {
  buildFifoLineQuote,
  normalizeMoneyPaisa,
  roundPaisa,
} from './sales-allocation'
import {
  SalesPermissionError,
  SalesValidationError,
} from './sales.errors'
import { SalesNumberingRepository } from './sales-numbering.repository'
import { SalesRepository } from './sales.repository'
import type {
  CommitSaleInput,
  CommittedSale,
  CommittedSaleLine,
} from './sales.types'

function businessDate(value: string): string {
  const normalized = value.trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new SalesValidationError(
      'Business date must use YYYY-MM-DD.',
    )
  }

  return normalized
}

function operationId(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalized,
    )
  ) {
    throw new SalesValidationError('Operation ID must be a UUID.')
  }

  return normalized
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

function validateInput(input: CommitSaleInput): CommitSaleInput {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new SalesValidationError(
      'At least one sale line is required.',
    )
  }

  for (const line of input.lines) {
    if (!line.variantId?.trim()) {
      throw new SalesValidationError('Variant is required.')
    }
    if (!line.baseQty?.trim()) {
      throw new SalesValidationError('Sale quantity is required.')
    }
  }

  return {
    operationId: operationId(input.operationId),
    businessDate: businessDate(input.businessDate),
    lines: input.lines.map((line) => ({
      variantId: line.variantId.trim(),
      baseQty: line.baseQty.trim(),
      ...(line.manualUnitSellingPricePaisa === undefined
        ? {}
        : {
            manualUnitSellingPricePaisa: normalizeMoneyPaisa(
              line.manualUnitSellingPricePaisa,
              'Manual selling price',
            ),
          }),
    })),
  }
}

export class SalesService {
  constructor(private readonly database: DatabaseClient) {}

  async commitSale(
    tenantId: string,
    actorUserId: string,
    canOverrideSellingPrice: boolean,
    rawInput: CommitSaleInput,
  ): Promise<CommittedSale> {
    const input = validateInput(rawInput)

    if (
      !canOverrideSellingPrice &&
      input.lines.some(
        (line) => line.manualUnitSellingPricePaisa !== undefined,
      )
    ) {
      throw new SalesPermissionError()
    }

    try {
      return await withDatabaseTransaction(
        this.database,
        async (database) => {
        const salesRepository = new SalesRepository(database)
        const inventoryRepository = new InventoryRepository(database)

        if (input.operationId) {
          const existing =
            await salesRepository.findCommittedSaleByOperationId(
              tenantId,
              input.operationId,
            )
          if (existing) {
            return existing
          }
        }

        const invoiceNumber =
          await new SalesNumberingRepository(
            database,
          ).allocateInvoiceNumber(tenantId)
        const invoice = await salesRepository.createInvoice({
          tenantId,
          invoiceNumber,
          operationId: input.operationId ?? null,
          businessDate: input.businessDate,
          createdByUserId: actorUserId,
        })

        const committedLines: CommittedSaleLine[] = []
        let totalSales = new Decimal(0)
        let totalCogs = new Decimal(0)

        for (const inputLine of input.lines) {
          const lockedLots =
            await salesRepository.listAvailableLotsForSaleForUpdate(
              tenantId,
              inputLine.variantId,
              input.businessDate,
            )
          const quote = buildFifoLineQuote(
            inputLine.variantId,
            inputLine.baseQty,
            lockedLots,
          )
          const manualUnit =
            inputLine.manualUnitSellingPricePaisa ?? null
          const pricingMode = manualUnit ? 'MANUAL' : 'LOT'
          const finalSalesTotalPaisa = manualUnit
            ? roundPaisa(
                new Decimal(quote.requestedBaseQty).times(
                  manualUnit,
                ),
              )
            : quote.automaticSalesTotalPaisa
          const finalSales = new Decimal(finalSalesTotalPaisa)
          const cogs = new Decimal(quote.cogsPaisa)
          const grossProfit = finalSales.minus(cogs)
          const belowCost = grossProfit.lt(0)
          const lossPaisa = belowCost
            ? grossProfit.abs().toFixed(0)
            : '0'

          const line = await salesRepository.createLine({
            tenantId,
            saleId: invoice.id,
            variantId: inputLine.variantId,
            baseQty: quote.requestedBaseQty,
            pricingMode,
            automaticSalesTotalPaisa:
              quote.automaticSalesTotalPaisa,
            manualUnitSellingPricePaisa: manualUnit,
            finalSalesTotalPaisa,
            cogsPaisa: quote.cogsPaisa,
          })

          const lotById = new Map(
            lockedLots.map((lot) => [lot.id, lot]),
          )

          for (const allocation of quote.allocations) {
            await salesRepository.createLineAllocation({
              tenantId,
              salesLineId: line.id,
              allocation,
            })

            const lot = lotById.get(allocation.lotId)
            if (!lot) {
              throw new Error('Locked sale lot disappeared')
            }

            const remaining = new Decimal(
              lot.remainingBaseQty,
            ).minus(allocation.baseQty)

            await inventoryRepository.setLotRemainingQuantity({
              tenantId,
              lotId: allocation.lotId,
              remainingBaseQty: remaining.toFixed(),
            })
          }

          const currentBalance =
            await inventoryRepository.getVariantBalance(
              tenantId,
              inputLine.variantId,
            )
          const movement = await inventoryRepository.createMovement({
            tenantId,
            variantId: inputLine.variantId,
            movementType: 'SALE',
            businessDate: input.businessDate,
            baseQtyDelta: new Decimal(
              quote.requestedBaseQty,
            ).negated().toFixed(),
            balanceAfterBaseQty: new Decimal(currentBalance)
              .minus(quote.requestedBaseQty)
              .toFixed(),
            referenceType: 'SALE',
            note: `Sale ${invoice.id}`,
            createdByUserId: actorUserId,
          })

          for (const allocation of quote.allocations) {
            await inventoryRepository.createMovementLotAllocation({
              tenantId,
              movementId: movement.id,
              lotId: allocation.lotId,
              baseQty: allocation.baseQty,
              unitCostPaisa: allocation.unitCostPaisa,
            })
          }

          totalSales = totalSales.plus(finalSales)
          totalCogs = totalCogs.plus(cogs)
          committedLines.push({
            id: line.id,
            variantId: inputLine.variantId,
            baseQty: quote.requestedBaseQty,
            pricingMode,
            manualUnitSellingPricePaisa: manualUnit,
            automaticSalesTotalPaisa:
              quote.automaticSalesTotalPaisa,
            finalSalesTotalPaisa,
            cogsPaisa: quote.cogsPaisa,
            grossProfitPaisa: grossProfit.toFixed(0),
            belowCost,
            lossPaisa,
            allocations: quote.allocations,
          })
        }

        await salesRepository.updateInvoiceTotals({
          tenantId,
          saleId: invoice.id,
          totalSalesPaisa: totalSales.toFixed(0),
          totalCogsPaisa: totalCogs.toFixed(0),
        })

        return {
          id: invoice.id,
          invoiceNumber,
          businessDate: input.businessDate,
          totalSalesPaisa: totalSales.toFixed(0),
          totalCogsPaisa: totalCogs.toFixed(0),
          grossProfitPaisa: totalSales.minus(totalCogs).toFixed(0),
          lines: committedLines,
        }
        },
      )
    } catch (error) {
      if (input.operationId && isUniqueViolation(error)) {
        const existing =
          await new SalesRepository(
            this.database,
          ).findCommittedSaleByOperationId(
            tenantId,
            input.operationId,
          )
        if (existing) {
          return existing
        }
      }

      throw error
    }
  }
}
