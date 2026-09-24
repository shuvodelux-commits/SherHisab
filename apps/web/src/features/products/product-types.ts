export type TrackingMode = 'SIMPLE' | 'LOT' | 'BATCH'
export type ProductStatusFilter = 'active' | 'inactive' | 'all'
export type ProductSortBy =
  | 'name'
  | 'category'
  | 'brand'
  | 'unit'
  | 'purchasePrice'
  | 'sellingPrice'
  | 'stock'
  | 'minimumStock'
  | 'stockValue'
  | 'status'
export type ProductSortDirection = 'asc' | 'desc'
export type ConversionMode = 'FIXED' | 'VARIABLE'

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
  stockValuePaisa: string
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
  sortBy?: ProductSortBy
  sortDir?: ProductSortDirection
  limit?: number
  offset?: number
}

export interface ProductAlternativeUnitDto {
  id?: string
  unit: ProductUnitDto
  conversionMode: ConversionMode
  conversionToBase: string | null
}

export interface ProductSpecificationDto {
  id?: string
  name: string
  value: string
  sortOrder?: number
}

export interface ProductVariantDto {
  id?: string
  displayName: string
  sku: string | null
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
  stockBaseQty?: string
  hasInventoryHistory?: boolean
  selections: Record<string, string>
  isActive?: boolean
}

export interface ProductAdvancedConfigurationDto {
  alternativeUnits: ProductAlternativeUnitDto[]
  specifications: ProductSpecificationDto[]
  variants: ProductVariantDto[]
}

export interface AlternativeUnitInput {
  unitId: string
  conversionMode: ConversionMode
  conversionToBase?: string | null
}

export interface SpecificationInput {
  name: string
  value: string
}

export interface VariantOptionInput {
  name: string
  values: string[]
}

export interface VariantInput {
  id?: string
  displayName: string
  sku?: string | null
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
  selections: Record<string, string>
}

export interface ReplaceVariantConfigurationInput {
  enabled: boolean
  options: VariantOptionInput[]
  variants: VariantInput[]
}

export interface AdvancedProductConfigurationInput {
  alternativeUnits?: AlternativeUnitInput[]
  specifications?: SpecificationInput[]
  variantConfiguration?: ReplaceVariantConfigurationInput
}

export interface CreateProductPayload {
  name: string
  brand: string
  categoryId: string | null
  baseUnitId: string
  barcode: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  openingStockBaseQty: string
  minimumStockBaseQty: string
  trackingMode: TrackingMode
  advanced?: AdvancedProductConfigurationInput
}

export interface UpdateProductPayload {
  name: string
  brand: string
  categoryId: string | null
  baseUnitId: string
  barcode: string
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
  trackingMode: TrackingMode
  advanced?: AdvancedProductConfigurationInput
}

export interface ProductStockTargetDto {
  id: string
  displayName: string
  stockBaseQty: string
  hasInventoryHistory: boolean
  isDefault: boolean
  isActive: boolean
}

export interface ProductDetailDto extends ProductListItemDto {
  primaryBarcode: string | null
  advanced?: ProductAdvancedConfigurationDto
  stockTargets?: ProductStockTargetDto[]
}

export interface ProductLotDto {
  id: string
  receivedOn: string
  sourceType: 'OPENING' | 'ADJUSTMENT'
  originalBaseQty: string
  remainingBaseQty: string
  unitCostPaisa: string
  defaultSellingPricePaisa: string
  status: 'ACTIVE' | 'DEPLETED'
  lotCode: string | null
  batchCode: string | null
  expiresOn: string | null
}
