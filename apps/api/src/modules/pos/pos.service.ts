import Decimal from 'decimal.js'
import { getPool } from '../../db/pool'
import type { DatabaseClient } from '../../db/request-database'
import type { PermissionKey } from '../auth/permissions'
import { CustomerService } from '../customers/customer.service'
import { CashSessionService } from '../finance/cash-session.service'
import { FinanceRepository } from '../finance/finance.repository'
import { ConversionService } from '../products/conversion.service'
import { ConversionRepository } from '../products/conversion.repository'
import type { QuantityInput } from '../products/conversion.types'
import { InsufficientStockError } from '../sales/sales.errors'
import { SalesPricingService } from '../sales/sales-pricing.service'
import { PosSettingsService } from '../settings/pos-settings.service'
import { PosRepository } from './pos.repository'
import type {
  PosBootstrap,
  PosCustomerSearchResult,
  PosLineQuote,
  PosLineQuoteInput,
  PosProductSearchOptions,
  PosProductSearchResult,
} from './pos.types'

function boundedLimit(value: number | undefined): number {
  const limit = value ?? 20

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('POS search limit must be between 1 and 50')
  }

  return limit
}

function decimalString(value: Decimal): string {
  return value.toFixed().replace(/\.0+$/, '').replace(
    /(\.\d*?)0+$/,
    '$1',
  )
}

export class PosService {
  private readonly repository: PosRepository

  constructor(
    private readonly tenantId: string,
    private readonly database: DatabaseClient = getPool(),
  ) {
    if (!tenantId.trim()) {
      throw new Error('Trusted tenant id is required')
    }

    this.repository = new PosRepository(database)
  }

  private async canRevealConfiguredPurchasePrice(
    permissions: PermissionKey[],
  ): Promise<boolean> {
    if (!permissions.includes('POS_COST_VIEW')) {
      return false
    }

    const settings = await new PosSettingsService(
      this.tenantId,
      this.database,
    ).get()

    return settings.showPurchasePrice
  }

  async searchProducts(
    rawQuery: string,
    options: PosProductSearchOptions = {},
  ): Promise<PosProductSearchResult[]> {
    const query = rawQuery.trim()
    if (!query) {
      return []
    }

    const limit = boundedLimit(options.limit)

    return await this.repository.searchProducts(
      this.tenantId,
      query,
      limit,
      options.includeConfiguredPurchasePrice ?? false,
    )
  }

  async searchProductsForClient(
    rawQuery: string,
    options: {
      limit?: number
      permissions: PermissionKey[]
    },
  ): Promise<PosProductSearchResult[]> {
    return this.searchProducts(rawQuery, {
      limit: options.limit,
      includeConfiguredPurchasePrice:
        await this.canRevealConfiguredPurchasePrice(
          options.permissions,
        ),
    })
  }

  async searchCustomers(
    rawQuery: string,
    limitInput?: number,
  ): Promise<PosCustomerSearchResult[]> {
    const query = rawQuery.trim()
    if (!query) {
      return []
    }

    const limit = boundedLimit(limitInput)
    const customers = (
      await new CustomerService(
        this.tenantId,
        this.database,
      ).search(query)
    ).slice(0, limit)

    return Promise.all(
      customers.map(async (customer) => ({
        id: customer.id,
        customerCode: customer.customerCode,
        name: customer.name,
        phone: customer.phone,
        guardianName: customer.guardianName,
        address: customer.address,
        balancePaisa: await new CustomerService(
          this.tenantId,
          this.database,
        ).balance(customer.id),
      })),
    )
  }

  async bootstrap(
    permissions: PermissionKey[],
  ): Promise<PosBootstrap> {
    const settingsService = new PosSettingsService(
      this.tenantId,
      this.database,
    )
    const [settings, financialAccounts, activeCashSession] =
      await Promise.all([
        settingsService.get(),
        new FinanceRepository(this.database).listAccounts(
          this.tenantId,
          false,
        ),
        new CashSessionService(
          this.tenantId,
          this.database,
        ).getActive(),
      ])

    const canViewConfiguredPurchasePrice =
      settings.showPurchasePrice &&
      permissions.includes('POS_COST_VIEW')

    return {
      capabilities: {
        canSell: permissions.includes('POS_SELL'),
        canOverrideSellingPrice: permissions.includes(
          'SALES_OVERRIDE_SELLING_PRICE',
        ),
        canViewConfiguredPurchasePrice,
        canBackdate: permissions.includes('SALES_BACKDATE'),
      },
      settings,
      financialAccounts,
      activeCashSession,
      recent: {
        drafts: [],
        templates: [],
      },
    }
  }

  async quoteLine(
    input: PosLineQuoteInput,
    permissions: PermissionKey[],
  ): Promise<PosLineQuote> {
    const variantId = input.variantId.trim()
    if (!variantId) {
      throw new Error('Variant is required')
    }

    const variant = await this.repository.findVariantContext(
      this.tenantId,
      variantId,
    )
    if (!variant) {
      throw new Error('Variant not found')
    }

    const conversionService = new ConversionService(
      this.tenantId,
      this.database,
    )
    const activeProfile = await conversionService.getActiveProfile(
      variant.productId,
    )

    let quantity: QuantityInput
    if (input.quantity) {
      quantity = input.quantity
    } else if (input.baseQty !== undefined) {
      quantity = {
        kind: 'SIMPLE',
        baseQty: input.baseQty,
      }
    } else {
      throw new Error('Quantity is required')
    }

    const conversion = await conversionService.normalize(
      quantity,
      quantity.kind === 'COMPONENTS' ? undefined : activeProfile ?? undefined,
      variant.productId,
    )

    if (
      conversion.snapshot &&
      conversion.snapshot.productId !== variant.productId
    ) {
      throw new Error(
        'Conversion profile does not belong to this Variant',
      )
    }

    const pricing = new SalesPricingService(this.database)
    let internalQuote:
      | Awaited<ReturnType<SalesPricingService['quoteFifoLine']>>
      | null = null
    let availableOwnBaseQty: string
    let shortfallBaseQty = '0'
    const pricingBaseFactor = conversion.snapshot
      ? new Decimal(conversion.snapshot.pricingBaseFactorNumerator)
          .div(conversion.snapshot.pricingBaseFactorDenominator).toFixed()
      : '1'

    try {
      internalQuote = await pricing.quoteFifoLine(
        this.tenantId,
        variantId,
        conversion.baseQty,
        input.businessDate,
        pricingBaseFactor,
      )
      availableOwnBaseQty = internalQuote.availableBaseQty
    } catch (error) {
      if (!(error instanceof InsufficientStockError)) {
        throw error
      }

      availableOwnBaseQty = error.availableBaseQty
      shortfallBaseQty = decimalString(
        new Decimal(error.requestedBaseQty).minus(
          error.availableBaseQty,
        ),
      )

      if (new Decimal(error.availableBaseQty).gt(0)) {
        internalQuote = await pricing.quoteFifoLine(
          this.tenantId,
          variantId,
          error.availableBaseQty,
          input.businessDate,
          pricingBaseFactor,
        )
      }
    }

    const canReveal =
      await this.canRevealConfiguredPurchasePrice(permissions)

    return {
      variantId,
      baseQty: conversion.baseQty,
      pricingQty: conversion.pricingQty,
      displayQty: conversion.displayQty,
      availableOwnBaseQty,
      shortfallBaseQty,
      automaticSalesTotalPaisa:
        internalQuote?.automaticSalesTotalPaisa ?? '0',
      effectiveUnitSellingPricePaisa:
        internalQuote
          ? new Decimal(internalQuote.automaticSalesTotalPaisa)
              .times(pricingBaseFactor)
              .div(internalQuote.requestedBaseQty)
              .toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)
          : variant.configuredSellingPricePaisa,
      sellingSegments:
        internalQuote?.allocations.map((allocation) => ({
          lotId: allocation.lotId,
          baseQty: allocation.baseQty,
          unitSellingPricePaisa:
            allocation.lotSellingPricePaisa,
          amountPaisa:
            allocation.automaticSalesAmountPaisa,
        })) ?? [],
      ...(canReveal
        ? {
            configuredPurchasePricePaisa:
              variant.configuredPurchasePricePaisa,
          }
        : {}),
      conversion,
      fixedUnitOptions: await new ConversionRepository(this.database).listFixedUnits(
        this.tenantId, variant.productId,
      ),
    }
  }
}
