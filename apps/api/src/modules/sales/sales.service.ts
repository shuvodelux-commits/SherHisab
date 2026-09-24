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

    return withDatabaseTransaction(
      this.database,
      async (database) => {
        const salesRepository = new SalesRepository(database)
        const inventoryRepository = new InventoryRepository(database)
        const invoice = await salesRepository.createInvoice({
          tenantId,
          businessDate: input.businessDate,
          createdByUserId: actorUserId,
        })

        const committedLines: CommittedSaleLine[] = []
        let totalSales = new Decimal(0)
        let totalCogs = new Decimal(0)

        for (const inputLine of input.lines) {
          const lockedLots =
            await salesRepository.listAvailableFifoLotsForUpdate(
              tenantId,
              inputLine.variantId,
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
          businessDate: input.businessDate,
          totalSalesPaisa: totalSales.toFixed(0),
          totalCogsPaisa: totalCogs.toFixed(0),
          grossProfitPaisa: totalSales.minus(totalCogs).toFixed(0),
          lines: committedLines,
        }
      },
    )
  }
}
