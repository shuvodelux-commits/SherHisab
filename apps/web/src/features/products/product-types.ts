export type TrackingMode = 'SIMPLE' | 'SERIAL' | 'BATCH_EXPIRY'
export type AllocationPolicy = 'FIFO' | 'FEFO'
export type WarrantyDurationUnit = 'DAY' | 'MONTH' | 'YEAR'
export type ProductCaptureFieldType = 'text' | 'number' | 'date' | 'select'
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
export type ConversionProfileType =
  | 'SIMPLE'
  | 'PACK'
  | 'LENGTH'
  | 'COMPOUND'
  | 'CUSTOM_FIXED_RATIO'

export interface ConversionComponentInput {
  key: string
  label: string
  unitId: string
  baseFactorNumerator: string
  baseFactorDenominator: string
  sortOrder: number
  minValue: string
  maxExclusive?: string | null
  allowFraction: boolean
  autoNormalizeRemainder: boolean
}

export interface ConversionProfileInput {
  type: ConversionProfileType
  baseUnitId: string
  pricingUnitId: string
  pricingBaseFactorNumerator: string
  pricingBaseFactorDenominator: string
  displayPrecision: number
  components: ConversionComponentInput[]
}

export interface ConversionComponentDto
  extends Omit<ConversionComponentInput, 'maxExclusive'> {
  id: string
  maxExclusive: string | null
}

export interface ConversionProfileDto {
  id: string
  productId: string
  type: ConversionProfileType
  version: number
  baseUnitId: string
  pricingUnitId: string
  pricingBaseFactorNumerator: string
  pricingBaseFactorDenominator: string
  displayPrecision: number
  components: ConversionComponentDto[]
}

export interface WarrantyPolicyInput {
  enabled: boolean
  durationValue?: number | null
  durationUnit?: WarrantyDurationUnit | null
  provider?: string
  text?: string
}

export interface WarrantyPolicyDto {
  id: string
  productId: string
  enabled: boolean
  durationValue: number | null
  durationUnit: WarrantyDurationUnit | null
  provider: string
  text: string
}

export interface ProductCaptureFieldInput {
  key: string
  label: string
  type: ProductCaptureFieldType
  selectOptions?: string[]
  required: boolean
}

export interface ProductCaptureFieldDto extends ProductCaptureFieldInput {
  id: string
  selectOptions: string[]
  sortOrder: number
}

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
  currentSellingPricePaisa: string
  stockBaseQty: string
  stockValuePaisa: string
  minimumStockBaseQty: string
  trackingMode: TrackingMode
  allocationPolicy: AllocationPolicy
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
  conversionProfile?: ConversionProfileDto | null
  warrantyPolicy?: WarrantyPolicyDto | null
  captureFields?: ProductCaptureFieldDto[]
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
  conversionProfile?: ConversionProfileInput | null
  warrantyPolicy?: WarrantyPolicyInput
  captureFields?: ProductCaptureFieldInput[]
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
  allocationPolicy: AllocationPolicy
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
