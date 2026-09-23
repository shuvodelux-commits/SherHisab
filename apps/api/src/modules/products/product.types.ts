export type TrackingMode = 'SIMPLE' | 'LOT' | 'BATCH'
export type ConversionMode = 'FIXED' | 'VARIABLE'
export type ProductStatusFilter = 'active' | 'inactive' | 'all'

export interface CategoryRecord {
  id: string
  name: string
  isActive: boolean
}

export interface UnitRecord {
  id: string
  name: string
  symbol: string | null
  isActive: boolean
}

export interface CreateUnitInput {
  name: string
  symbol?: string | null
}

export interface CreateProductInput {
  name: string
  brand?: string
  categoryId?: string | null
  baseUnitId: string
  barcode?: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  openingStockBaseQty: string
  minimumStockBaseQty: string
  trackingMode?: TrackingMode
}

export interface UpdateProductInput {
  name: string
  brand?: string
  categoryId?: string | null
  baseUnitId: string
  barcode?: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
  trackingMode: TrackingMode
}

export interface ProductListFilters {
  search?: string
  categoryId?: string
  brand?: string
  status?: ProductStatusFilter
  limit?: number
  offset?: number
}
