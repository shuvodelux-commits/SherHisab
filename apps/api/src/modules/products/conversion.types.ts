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
  id?: undefined
  version?: undefined
}

export interface ConversionComponentSnapshot
  extends Omit<ConversionComponentInput, 'maxExclusive'> {
  id: string
  maxExclusive: string | null
}

export interface ConversionProfileSnapshot {
  id: string
  productId: string
  type: ConversionProfileType
  version: number
  baseUnitId: string
  pricingUnitId: string
  pricingBaseFactorNumerator: string
  pricingBaseFactorDenominator: string
  displayPrecision: number
  components: ConversionComponentSnapshot[]
}

export type QuantityInput =
  | {
      kind: 'SIMPLE'
      baseQty: string
    }
  | {
      kind: 'COMPONENTS'
      profileId: string
      profileVersion: number
      components: Record<string, string>
    }

export interface NormalizedQuantity {
  baseQty: string
  pricingQty: string
  displayQty: string
  components: Record<string, string>
  snapshot: ConversionProfileSnapshot | null
}
