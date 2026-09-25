export interface CreateCustomerInput {
  name: string
  phone?: string
  guardianName?: string
  address?: string
}

export interface CustomerRecord {
  id: string
  customerCode: string
  name: string
  phone: string
  normalizedPhone: string
  guardianName: string
  address: string
  isActive: boolean
}

export type CustomerPhoneResolution =
  | {
      kind: 'NONE'
      normalizedPhone: string
      customer: null
      matches: []
    }
  | {
      kind: 'UNIQUE'
      normalizedPhone: string
      customer: CustomerRecord
      matches: CustomerRecord[]
    }
  | {
      kind: 'AMBIGUOUS'
      normalizedPhone: string
      customer: null
      matches: CustomerRecord[]
    }
