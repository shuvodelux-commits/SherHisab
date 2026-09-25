import Decimal from 'decimal.js'
import type { DatabaseClient } from '../../db/request-database'
import { withDatabaseTransaction } from '../../db/transaction'
import { roundPaisa } from '../sales/sales-allocation'
import { ShortfallRepository } from '../sales/shortfall.repository'
import {
  ProductNotFoundError,
  ProductValidationError,
} from './product.errors'
import { InventoryRepository } from './inventory.repository'
import { parseMoneyPaisa } from './product.validation'

export interface ReceivePurchaseInput {
  tenantId: string
  actorUserId: string
  variantId: string
  businessDate: string
  sourceReference: string
  receivedBaseQty: string
  unitCostPaisa: string
  sellingPricePaisa: string
}

export interface PurchaseReceiptResult {
  lotId: string
  receivedBaseQty: string
  reconciledBaseQty: string
  remainingPhysicalBaseQty: string
}

function positiveQuantity(value: string): Decimal {
  let quantity: Decimal
  try {
    quantity = new Decimal(value)
  } catch {
    throw new ProductValidationError(
      'Purchase receipt quantity must be valid',
    )
  }

  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new ProductValidationError(
      'Purchase receipt quantity must be greater than zero',
    )
  }
  return quantity
}

function purchaseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ProductValidationError(
      'Purchase business date must use YYYY-MM-DD',
    )
  }
  return value
}

export class InventoryReceiptService {
  constructor(private readonly database: DatabaseClient) {}

  receivePurchase(
    input: ReceivePurchaseInput,
  ): Promise<PurchaseReceiptResult> {
    return withDatabaseTransaction(
      this.database,
      async (database) =>
        new InventoryReceiptService(
          database,
        ).receivePurchaseInTransaction(input),
    )
  }

  async receivePurchaseInTransaction(
    input: ReceivePurchaseInput,
  ): Promise<PurchaseReceiptResult> {
    if (!input.tenantId.trim()) {
      throw new ProductValidationError(
        'Trusted tenant id is required',
      )
    }
    if (!input.actorUserId.trim()) {
      throw new ProductValidationError(
        'Purchase receipt actor is required',
      )
    }
    if (!input.sourceReference.trim()) {
      throw new ProductValidationError(
        'Purchase source reference is required',
      )
    }

    const quantity = positiveQuantity(input.receivedBaseQty)
    const businessDate = purchaseDate(input.businessDate)
    const unitCostPaisa = parseMoneyPaisa(
      input.unitCostPaisa,
      'Purchase price',
    )
    const sellingPricePaisa = parseMoneyPaisa(
      input.sellingPricePaisa,
      'Selling price',
    )
    if (BigInt(unitCostPaisa) <= 0n) {
      throw new ProductValidationError(
        'Purchase price must be greater than zero',
      )
    }

    const inventory = new InventoryRepository(this.database)
    const variant = await inventory.lockActiveVariant(
      input.tenantId,
      input.variantId,
    )
    if (!variant) {
      throw new ProductNotFoundError(
        'Product variant not found.',
      )
    }

    const balanceBefore = new Decimal(
      await inventory.getVariantBalance(
        input.tenantId,
        input.variantId,
      ),
    )
    const lot = await inventory.createLot({
      tenantId: input.tenantId,
      variantId: input.variantId,
      sourceType: 'PURCHASE',
      receivedOn: businessDate,
      unitCostPaisa,
      defaultSellPricePaisa: sellingPricePaisa,
      baseQty: quantity.toFixed(),
    })
    const movement = await inventory.createMovement({
      tenantId: input.tenantId,
      variantId: input.variantId,
      movementType: 'PURCHASE',
      businessDate,
      baseQtyDelta: quantity.toFixed(),
      balanceAfterBaseQty: balanceBefore.plus(quantity).toFixed(),
      referenceType: 'PURCHASE',
      note: input.sourceReference.trim(),
      createdByUserId: input.actorUserId,
    })
    await inventory.createMovementLotAllocation({
      tenantId: input.tenantId,
      movementId: movement.id,
      lotId: lot.id,
      baseQty: quantity.toFixed(),
      unitCostPaisa,
    })

    const shortfalls =
      await new ShortfallRepository(
        this.database,
      ).listOutstandingForUpdate(
        input.tenantId,
        input.variantId,
      )

    let remainingReceipt = quantity
    let reconciledTotal = new Decimal(0)
    const shortfallRepository = new ShortfallRepository(
      this.database,
    )

    for (const shortfall of shortfalls) {
      if (remainingReceipt.lte(0)) {
        break
      }

      const outstanding = new Decimal(
        shortfall.outstandingBaseQty,
      )
      const reconciled = Decimal.min(
        remainingReceipt,
        outstanding,
      )
      if (reconciled.lte(0)) {
        continue
      }

      const outstandingAfter = outstanding.minus(reconciled)
      const costDelta = new Decimal(unitCostPaisa)
        .minus(shortfall.provisionalUnitCostPaisa)
        .times(reconciled)

      const cogsAdjustmentPaisa = roundPaisa(costDelta)
      await shortfallRepository.createReconciliation({
        tenantId: input.tenantId,
        shortfallId: shortfall.id,
        purchaseLotId: lot.id,
        reconciledBaseQty: reconciled.toFixed(),
        provisionalUnitCostPaisa:
          shortfall.provisionalUnitCostPaisa,
        actualUnitCostPaisa: unitCostPaisa,
        cogsAdjustmentPaisa,
      })
      await shortfallRepository.applyCogsAdjustment({
        tenantId: input.tenantId,
        salesLineId: shortfall.salesLineId,
        cogsAdjustmentPaisa,
      })
      await shortfallRepository.updateOutstanding({
        tenantId: input.tenantId,
        shortfallId: shortfall.id,
        outstandingBaseQty: outstandingAfter.toFixed(),
      })

      remainingReceipt = remainingReceipt.minus(reconciled)
      reconciledTotal = reconciledTotal.plus(reconciled)
    }

    await inventory.setLotRemainingQuantity({
      tenantId: input.tenantId,
      lotId: lot.id,
      remainingBaseQty: remainingReceipt.toFixed(),
    })

    return {
      lotId: lot.id,
      receivedBaseQty: quantity.toFixed(),
      reconciledBaseQty: reconciledTotal.toFixed(),
      remainingPhysicalBaseQty: remainingReceipt.toFixed(),
    }
  }
}
