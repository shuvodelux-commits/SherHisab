export type FinancialAccountType =
  | 'BANK'
  | 'MOBILE_BANKING'

export interface FinancialAccountRecord {
  id: string
  type: FinancialAccountType
  name: string
  provider: string
  accountReference: string
  isActive: boolean
}

export interface CreateFinancialAccountInput {
  tenantId: string
  type: FinancialAccountType
  name: string
  provider?: string
  accountReference?: string
}

export interface UpdateFinancialAccountInput {
  name: string
  provider?: string
  accountReference?: string
  isActive: boolean
}
