export type TrackingMode = 'SIMPLE' | 'LOT' | 'BATCH'
export type ConversionMode = 'FIXED' | 'VARIABLE'
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
  | 'status'
export type ProductSortDirection = 'asc' | 'desc'

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
  advanced?: AdvancedProductConfigurationInput
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
  advanced?: AdvancedProductConfigurationInput
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

export interface ProductListItem {
  id: string
  name: string
  brand: string
  category: CategoryRecord | null
  baseUnit: UnitRecord
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

export interface ProductListResult {
  items: ProductListItem[]
  total: number
  limit: number
  offset: number
}

export interface ProductDetail extends ProductListItem {
  primaryBarcode: string | null
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

export interface ProductAlternativeUnitRecord {
  id: string
  unit: UnitRecord
  conversionMode: ConversionMode
  conversionToBase: string | null
}

export interface ProductSpecificationRecord {
  id: string
  name: string
  value: string
  sortOrder: number
}

export interface ProductVariantDetail {
  id: string
  displayName: string
  sku: string | null
  defaultPurchasePricePaisa: string
  defaultSellingPricePaisa: string
  minimumStockBaseQty: string
  stockBaseQty: string
  hasInventoryHistory: boolean
  selections: Record<string, string>
  isActive: boolean
}

export interface ProductStockTarget {
  id: string
  displayName: string
  stockBaseQty: string
  hasInventoryHistory: boolean
  isDefault: boolean
  isActive: boolean
}

export interface ProductAdvancedConfiguration {
  alternativeUnits: ProductAlternativeUnitRecord[]
  specifications: ProductSpecificationRecord[]
  variants: ProductVariantDetail[]
}
