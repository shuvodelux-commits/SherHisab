export type TrackingMode = 'SIMPLE' | 'LOT' | 'BATCH'
export type ProductStatusFilter = 'active' | 'inactive' | 'all'

export interface ProductCategoryDto {
  id: string
  name: string
  isActive: boolean
}

export interface ProductUnitDto {
  id: string
  name: string
  symbol: string | null
  isActive: boolean
}

export interface ProductListItemDto {
  id: string
  name: string
  brand: string
  category: ProductCategoryDto | null
  baseUnit: ProductUnitDto
  defaultVariantId: string
  variantCount: number
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  stockBaseQty: string
  minimumStockBaseQty: string
  trackingMode: TrackingMode
  variantsEnabled: boolean
  isActive: boolean
}

export interface ProductListResponse {
  items: ProductListItemDto[]
  total: number
  limit: number
  offset: number
}

export interface ProductListFilters {
  search?: string
  categoryId?: string
  brand?: string
  status?: ProductStatusFilter
  limit?: number
  offset?: number
}

export interface ProductDetailDto extends ProductListItemDto {
  primaryBarcode: string | null
  advanced?: unknown
}

export interface ProductLotDto {
  id: string
  receivedOn: string
  sourceType: 'OPENING' | 'ADJUSTMENT'
  originalBaseQty: string
  remainingBaseQty: string
  unitCostPaisa: string
  status: 'ACTIVE' | 'DEPLETED'
  lotCode: string | null
  batchCode: string | null
  expiresOn: string | null
}
