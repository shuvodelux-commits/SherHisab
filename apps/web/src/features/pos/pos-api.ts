import { apiRequest } from '../../lib/api-client'
import type {
  CommitSalePayload,
  CommittedSaleDto,
  PosBootstrapDto,
  PosCustomerSearchDto,
  PosLineQuoteDto,
  PosProductSearchDto,
  PosQuantityInputDto,
} from './pos-types'

const API_ROOT = '/api/private'

export function getPosBootstrap(): Promise<PosBootstrapDto> {
  return apiRequest<PosBootstrapDto>(`${API_ROOT}/pos/bootstrap`)
}

export function searchPosProducts(
  search: string,
  limit = 20,
): Promise<PosProductSearchDto[]> {
  const params = new URLSearchParams({
    search,
    limit: String(limit),
  })

  return apiRequest<PosProductSearchDto[]>(
    `${API_ROOT}/pos/products?${params.toString()}`,
  )
}

export function searchPosCustomers(
  search: string,
  limit = 20,
): Promise<PosCustomerSearchDto[]> {
  const params = new URLSearchParams({
    search,
    limit: String(limit),
  })

  return apiRequest<PosCustomerSearchDto[]>(
    `${API_ROOT}/pos/customers?${params.toString()}`,
  )
}

export function quoteSaleLine(
  variantId: string,
  baseQty?: string,
  quantity?: PosQuantityInputDto,
): Promise<PosLineQuoteDto> {
  return apiRequest<PosLineQuoteDto>(`${API_ROOT}/pos/quote-line`, {
    method: 'POST',
    body: JSON.stringify({
      variantId,
      ...(baseQty === undefined ? {} : { baseQty }),
      ...(quantity === undefined ? {} : { quantity }),
    }),
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
