export type MatureTrackingMode =
  | 'SIMPLE'
  | 'SERIAL'
  | 'BATCH_EXPIRY'

export type AllocationPolicy = 'FIFO' | 'FEFO'

export type InventorySerialStatus =
  | 'IN_STOCK'
  | 'SOLD'
  | 'RETURNED'

export interface InventorySerialRecord {
  id: string
  variantId: string
  lotId: string | null
  serialNumber: string
  status: InventorySerialStatus
  receivedOn: string
}

export type WarrantyDurationUnit = 'DAY' | 'MONTH' | 'YEAR'

export interface WarrantyPolicyInput {
  enabled: boolean
  durationValue?: number | null
  durationUnit?: WarrantyDurationUnit | null
  provider?: string
  text?: string
}

export interface WarrantyPolicyRecord {
  id: string
  productId: string
  enabled: boolean
  durationValue: number | null
  durationUnit: WarrantyDurationUnit | null
  provider: string
  text: string
}

export interface WarrantySnapshotRecord {
  id: string
  salesLineId: string
  serialId: string | null
  sourcePolicyId: string | null
  durationValue: number
  durationUnit: WarrantyDurationUnit
  provider: string
  text: string
  startsOn: string
  expiresOn: string
}

export type ProductCaptureFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'

export interface ProductCaptureFieldDefinitionInput {
  key: string
  label: string
  type: ProductCaptureFieldType
  selectOptions?: string[]
  required: boolean
}

export interface ProductCaptureFieldDefinition
  extends ProductCaptureFieldDefinitionInput {
  id: string
  sortOrder: number
}
