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


export type CashSessionStatus = 'OPEN' | 'CLOSED'

export interface CashSessionRecord {
  id: string
  status: CashSessionStatus
  openingCashPaisa: string
  expectedCashPaisa: string
  countedCashPaisa: string | null
  variancePaisa: string | null
  openedAt: Date
  closedAt: Date | null
  notes: string
  openedByUserId: string
  closedByUserId: string | null
}

export interface OpenCashSessionInput {
  openingCashPaisa: string
  actorUserId: string
  notes?: string
}

export interface CloseCashSessionInput {
  countedCashPaisa: string
  actorUserId: string
  notes?: string
}
