import { describe, expect, it } from 'vitest'
import {
  StockSourceService,
  type InternalLotAllocation,
} from '../../src/modules/sales/stock-source.service'

function ownAllocation(
  baseQty: string,
  unitCostPaisa = '100',
): InternalLotAllocation {
  return {
    lotId: 'lot-1',
    baseQty,
    unitCostPaisa,
    lotSellingPricePaisa: '150',
    automaticSalesAmountPaisa: (
      BigInt(baseQty) * 150n
    ).toString(),
    cogsAmountPaisa: (
      BigInt(baseQty) * BigInt(unitCostPaisa)
    ).toString(),
  }
}

describe('StockSourceService', () => {
  it('reports a 5-unit shortfall when own stock is 5 and requested quantity is 10', () => {
    const result = new StockSourceService().plan({
      requestedBaseQty: '10',
      ownAllocations: [ownAllocation('5')],
      shortageResolution: null,
    })

    expect(result).toEqual({
      type: 'PLAN',
      plan: {
        requestedBaseQty: '10',
        ownBaseQty: '5',
        shortfallBaseQty: '5',
        ownAllocations: [ownAllocation('5')],
        shortageResolution: null,
      },
    })
  })

  it('clamps requested quantity to available own stock when OWN_STOCK is selected', () => {
    const result = new StockSourceService().plan({
      requestedBaseQty: '10',
      ownAllocations: [ownAllocation('5')],
      shortageResolution: { type: 'OWN_STOCK' },
    })

    expect(result).toEqual({
      type: 'PLAN',
      plan: {
        requestedBaseQty: '5',
        ownBaseQty: '5',
        shortfallBaseQty: '0',
        ownAllocations: [ownAllocation('5')],
        shortageResolution: null,
      },
    })
  })

  it('returns an explicit line-removal decision when OWN_STOCK is selected with zero own stock', () => {
    const result = new StockSourceService().plan({
      requestedBaseQty: '10',
      ownAllocations: [],
      shortageResolution: { type: 'OWN_STOCK' },
    })

    expect(result).toEqual({
      type: 'REMOVE_LINE',
      reason: 'NO_OWN_STOCK',
      plan: {
        requestedBaseQty: '0',
        ownBaseQty: '0',
        shortfallBaseQty: '0',
        ownAllocations: [],
        shortageResolution: null,
      },
    })
  })

  it('accepts exactly one Negative Stock resolution for the whole shortfall', () => {
    const result = new StockSourceService().plan({
      requestedBaseQty: '10',
      ownAllocations: [ownAllocation('5')],
      shortageResolution: { type: 'NEGATIVE_STOCK' },
    })

    expect(result).toMatchObject({
      type: 'PLAN',
      plan: {
        requestedBaseQty: '10',
        ownBaseQty: '5',
        shortfallBaseQty: '5',
        shortageResolution: { type: 'NEGATIVE_STOCK' },
      },
    })
  })

  it('rejects a mixed Vendor and Negative Stock resolution', () => {
    const mixedResolution = {
      type: 'NEGATIVE_STOCK',
      vendorId: 'vendor-1',
      unitCostPaisa: '80',
    }

    expect(() =>
      new StockSourceService().plan({
        requestedBaseQty: '10',
        ownAllocations: [ownAllocation('5')],
        shortageResolution:
          mixedResolution as unknown as {
            type: 'NEGATIVE_STOCK'
          },
      }),
    ).toThrow(/one shortage.*one resolution|mixed.*resolution/i)
  })
})
