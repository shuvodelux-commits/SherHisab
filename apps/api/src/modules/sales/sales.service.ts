import Decimal from 'decimal.js'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import { InventoryRepository } from '../products/inventory.repository'
import type { CustomerRecord } from '../customers/customer.types'
import { CustomerResolutionService } from './customer-resolution.service'
import { PaymentPostingService } from './payment-posting.service'
import {
  allocateHeaderDiscount,
  planSettlement,
  wholePaisa,
} from './sales-settlement'
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
  CommitSaleLineInput,
  CommittedSale,
  CommittedSaleLine,
  SaleCustomerInput,
  SalesPaymentInput,
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

function normalizeLines(lines: CommitSaleLineInput[]): CommitSaleLineInput[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new SalesValidationError('At least one sale line is required.')
  }
  return lines.map((line) => {
    if (!line.variantId?.trim()) {
      throw new SalesValidationError('Variant is required.')
    }
    if (!line.baseQty?.trim()) {
      throw new SalesValidationError('Sale quantity is required.')
    }
    return {
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
    }
  })
}

function isMatureInput(input: CommitSaleInput): boolean {
  return (
    input.customer !== undefined ||
    input.payments !== undefined ||
    input.discountPaisa !== undefined
  )
}

interface PlannedLine {
  input: CommitSaleLineInput
  lockedLots: Awaited<
    ReturnType<SalesRepository['listAvailableLotsForSaleForUpdate']>
  >
  quote: ReturnType<typeof buildFifoLineQuote>
  grossAmountPaisa: string
  cogsPaisa: string
  snapshot: Awaited<ReturnType<SalesRepository['getVariantSnapshot']>>
}

export class SalesService {
  constructor(private readonly database: DatabaseClient) {}

  async commitSale(
    tenantId: string,
    actorUserId: string,
    canOverrideSellingPrice: boolean,
    rawInput: CommitSaleInput,
  ): Promise<CommittedSale> {
    const normalizedOperationId = operationId(rawInput.operationId)
    const input: CommitSaleInput = {
      ...rawInput,
      operationId: normalizedOperationId,
      businessDate: businessDate(rawInput.businessDate),
      lines: normalizeLines(rawInput.lines),
    }

    if (
      !canOverrideSellingPrice &&
      input.lines.some(
        (line) => line.manualUnitSellingPricePaisa !== undefined,
      )
    ) {
      throw new SalesPermissionError()
    }

    if (isMatureInput(input)) {
      return this.commitMatureSale(
        tenantId,
        actorUserId,
        input,
      )
    }

    return this.commitFoundationSale(
      tenantId,
      actorUserId,
      input,
    )
  }

  private async commitMatureSale(
    tenantId: string,
    actorUserId: string,
    input: CommitSaleInput,
  ): Promise<CommittedSale> {
    if (!input.operationId) {
      throw new SalesValidationError('Operation ID is required.')
    }
    if (!input.customer) {
      throw new SalesValidationError('Customer snapshot is required.')
    }
    const payments: SalesPaymentInput[] = input.payments ?? []
    const discountPaisa = wholePaisa(
      input.discountPaisa ?? '0',
      'Discount',
    ).toString()

    try {
      return await withDatabaseTransaction(
        this.database,
        async (database) => {
          const salesRepository = new SalesRepository(database)
          const existing =
            await salesRepository.findCommittedSaleByOperationId(
              tenantId,
              input.operationId!,
            )
          if (existing) {
            return existing
          }

          const resolver = new CustomerResolutionService(
            tenantId,
            database,
          )
          const snapshot = resolver.snapshot(
            input.customer as SaleCustomerInput,
          )

          const plannedLines: PlannedLine[] = []
          let subtotal = 0n
          let totalCogs = 0n

          for (const line of input.lines) {
            const lockedLots =
              await salesRepository.listAvailableLotsForSaleForUpdate(
                tenantId,
                line.variantId,
                input.businessDate,
              )
            const quote = buildFifoLineQuote(
              line.variantId,
              line.baseQty,
              lockedLots,
            )
            const manualUnit =
              line.manualUnitSellingPricePaisa ?? null
            const grossAmountPaisa = manualUnit
              ? roundPaisa(
                  new Decimal(quote.requestedBaseQty).times(manualUnit),
                )
              : quote.automaticSalesTotalPaisa
            const variantSnapshot =
              await salesRepository.getVariantSnapshot(
                tenantId,
                line.variantId,
              )

            subtotal += BigInt(grossAmountPaisa)
            totalCogs += BigInt(quote.cogsPaisa)
            plannedLines.push({
              input: line,
              lockedLots,
              quote,
              grossAmountPaisa,
              cogsPaisa: quote.cogsPaisa,
              snapshot: variantSnapshot,
            })
          }

          const discounts = allocateHeaderDiscount(
            plannedLines.map((line) => line.grossAmountPaisa),
            discountPaisa,
          )
          const grandTotal = subtotal - BigInt(discountPaisa)
          const settlement = planSettlement(
            payments,
            grandTotal.toString(),
          )

          const hasCustomerCredit = settlement.payments.some(
            (payment) =>
              payment.method === 'CUSTOMER_CREDIT' &&
              BigInt(payment.appliedAmountPaisa) > 0n,
          )

          let customer: CustomerRecord | null = null
          if (hasCustomerCredit) {
            customer = await resolver.existingForCredit(snapshot)
          } else if (BigInt(settlement.duePaisa) > 0n) {
            customer = await resolver.forReceivable(snapshot)
          } else if (snapshot.selectedCustomerId) {
            customer = await resolver.selected(snapshot)
          }

          if (BigInt(settlement.duePaisa) > 0n && !customer) {
            customer = await resolver.forReceivable(snapshot)
          }

          const paymentPosting = new PaymentPostingService(
            tenantId,
            database,
          )
          const preparedPayments = await paymentPosting.prepare(
            settlement.payments,
            customer,
          )

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

          const inventoryRepository = new InventoryRepository(database)
          const committedLines: CommittedSaleLine[] = []

          for (let index = 0; index < plannedLines.length; index += 1) {
            const planned = plannedLines[index]!
            const discount = discounts[index]!
            const manualUnit =
              planned.input.manualUnitSellingPricePaisa ?? null
            const pricingMode = manualUnit ? 'MANUAL' : 'LOT'
            const net = BigInt(discount.netAmountPaisa)
            const cogs = BigInt(planned.cogsPaisa)
            const grossProfit = net - cogs
            const belowCost = grossProfit < 0n

            const line = await salesRepository.createLine({
              tenantId,
              saleId: invoice.id,
              variantId: planned.input.variantId,
              baseQty: planned.quote.requestedBaseQty,
              pricingMode,
              automaticSalesTotalPaisa:
                planned.quote.automaticSalesTotalPaisa,
              manualUnitSellingPricePaisa: manualUnit,
              finalSalesTotalPaisa: planned.grossAmountPaisa,
              cogsPaisa: planned.cogsPaisa,
              productId: planned.snapshot.productId,
              unitId: planned.snapshot.unitId,
              productNameSnapshot: planned.snapshot.productName,
              variantNameSnapshot: planned.snapshot.variantName,
              unitNameSnapshot: planned.snapshot.unitName,
              unitSymbolSnapshot: planned.snapshot.unitSymbol,
              pricingQty: planned.quote.requestedBaseQty,
              trackingSnapshot: {
                trackingMode: planned.snapshot.trackingMode,
                allocationPolicy: planned.snapshot.allocationPolicy,
              },
              grossAmountPaisa: discount.grossAmountPaisa,
              allocatedDiscountPaisa:
                discount.allocatedDiscountPaisa,
              netAmountPaisa: discount.netAmountPaisa,
            })

            const lotById = new Map(
              planned.lockedLots.map((lot) => [lot.id, lot]),
            )
            for (const allocation of planned.quote.allocations) {
              await salesRepository.createLineAllocation({
                tenantId,
                salesLineId: line.id,
                allocation,
              })
              const lot = lotById.get(allocation.lotId)
              if (!lot) {
                throw new Error('Locked sale lot disappeared')
              }
              await inventoryRepository.setLotRemainingQuantity({
                tenantId,
                lotId: allocation.lotId,
                remainingBaseQty: new Decimal(
                  lot.remainingBaseQty,
                )
                  .minus(allocation.baseQty)
                  .toFixed(),
              })
            }

            const currentBalance =
              await inventoryRepository.getVariantBalance(
                tenantId,
                planned.input.variantId,
              )
            const movement = await inventoryRepository.createMovement({
              tenantId,
              variantId: planned.input.variantId,
              movementType: 'SALE',
              businessDate: input.businessDate,
              baseQtyDelta: new Decimal(
                planned.quote.requestedBaseQty,
              ).negated().toFixed(),
              balanceAfterBaseQty: new Decimal(currentBalance)
                .minus(planned.quote.requestedBaseQty)
                .toFixed(),
              referenceType: 'SALE',
              note: `Sale ${invoice.id}`,
              createdByUserId: actorUserId,
            })
            for (const allocation of planned.quote.allocations) {
              await inventoryRepository.createMovementLotAllocation({
                tenantId,
                movementId: movement.id,
                lotId: allocation.lotId,
                baseQty: allocation.baseQty,
                unitCostPaisa: allocation.unitCostPaisa,
              })
            }

            committedLines.push({
              id: line.id,
              variantId: planned.input.variantId,
              baseQty: planned.quote.requestedBaseQty,
              pricingMode,
              manualUnitSellingPricePaisa: manualUnit,
              automaticSalesTotalPaisa:
                planned.quote.automaticSalesTotalPaisa,
              finalSalesTotalPaisa: planned.grossAmountPaisa,
              cogsPaisa: planned.cogsPaisa,
              grossProfitPaisa: grossProfit.toString(),
              belowCost,
              lossPaisa: belowCost ? (-grossProfit).toString() : '0',
              allocations: planned.quote.allocations,
              grossAmountPaisa: discount.grossAmountPaisa,
              allocatedDiscountPaisa:
                discount.allocatedDiscountPaisa,
              netAmountPaisa: discount.netAmountPaisa,
            })
          }

          const invoiceSnapshot =
            snapshot.selectedCustomerId && customer
              ? {
                  name: customer.name,
                  phone: customer.phone,
                  normalizedPhone: customer.normalizedPhone,
                  guardianName: customer.guardianName,
                  address: customer.address,
                }
              : snapshot

          await salesRepository.finalizeMatureInvoice({
            tenantId,
            saleId: invoice.id,
            customerId: customer?.id ?? null,
            customerName: invoiceSnapshot.name,
            customerPhone: invoiceSnapshot.phone,
            normalizedPhone: invoiceSnapshot.normalizedPhone,
            guardianName: invoiceSnapshot.guardianName,
            address: invoiceSnapshot.address,
            subtotalPaisa: subtotal.toString(),
            discountPaisa,
            grandTotalPaisa: grandTotal.toString(),
            settlementStatus: settlement.status,
            paidAmountPaisa: settlement.paidAmountPaisa,
            duePaisa: settlement.duePaisa,
            totalCogsPaisa: totalCogs.toString(),
          })

          await paymentPosting.post(
            invoice.id,
            input.businessDate,
            actorUserId,
            customer,
            preparedPayments,
          )

          if (BigInt(settlement.duePaisa) > 0n) {
            if (!customer) {
              throw new Error('Due sale is missing its Customer')
            }
            await salesRepository.createCustomerReceivable({
              tenantId,
              customerId: customer.id,
              businessDate: input.businessDate,
              amountPaisa: settlement.duePaisa,
              saleId: invoice.id,
            })
          }

          const grossProfit = grandTotal - totalCogs
          return {
            id: invoice.id,
            invoiceNumber,
            businessDate: input.businessDate,
            totalSalesPaisa: grandTotal.toString(),
            totalCogsPaisa: totalCogs.toString(),
            grossProfitPaisa: grossProfit.toString(),
            lines: committedLines,
            customerId: customer?.id ?? null,
            subtotalPaisa: subtotal.toString(),
            discountPaisa,
            grandTotalPaisa: grandTotal.toString(),
            settlementStatus: settlement.status,
            paidAmountPaisa: settlement.paidAmountPaisa,
            duePaisa: settlement.duePaisa,
            changePaisa: settlement.changePaisa,
          }
        },
      )
    } catch (error) {
      if (input.operationId && isUniqueViolation(error)) {
        const existing = await new SalesRepository(
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

  private async commitFoundationSale(
    tenantId: string,
    actorUserId: string,
    input: CommitSaleInput,
  ): Promise<CommittedSale> {
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
              await inventoryRepository.setLotRemainingQuantity({
                tenantId,
                lotId: allocation.lotId,
                remainingBaseQty: new Decimal(
                  lot.remainingBaseQty,
                )
                  .minus(allocation.baseQty)
                  .toFixed(),
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
              lossPaisa: belowCost
                ? grossProfit.abs().toFixed(0)
                : '0',
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
