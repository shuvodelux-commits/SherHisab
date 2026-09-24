import { apiRequest } from '../../lib/api-client'
import type {
  CommitSalePayload,
  CommittedSaleDto,
  SaleQuoteDto,
} from './pos-types'

const API_ROOT = '/api/private'

export function quoteSaleLine(
  variantId: string,
  baseQty: string,
): Promise<SaleQuoteDto> {
  return apiRequest<SaleQuoteDto>(`${API_ROOT}/sales/quote-line`, {
    method: 'POST',
    body: JSON.stringify({ variantId, baseQty }),
  })
}

export function commitSale(
  input: CommitSalePayload,
): Promise<CommittedSaleDto> {
  return apiRequest<CommittedSaleDto>(`${API_ROOT}/sales`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
