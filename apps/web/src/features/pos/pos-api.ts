import { apiRequest } from '../../lib/api-client'
import type {
  CommitSalePayload,
  CommittedSaleDto,
  PosBootstrapDto,
  PosCustomerSearchDto,
  PosLineQuoteDto,
  PosProductSearchDto,
  PosQuantityInputDto,
  PosVendorSearchDto,
  SalesDraftDto,
  SalesTemplateLineInputDto,
  SalesTemplateLoadedDto,
  SalesTemplateRecordDto,
  SalesTemplateSummaryDto,
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

export function getPosProductByVariant(
  variantId: string,
): Promise<PosProductSearchDto> {
  return apiRequest<PosProductSearchDto>(
    `${API_ROOT}/pos/products/${encodeURIComponent(variantId)}`,
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

export function searchPosVendors(
  search: string,
  limit = 20,
): Promise<PosVendorSearchDto[]> {
  const params = new URLSearchParams({
    search,
    limit: String(limit),
  })

  return apiRequest<PosVendorSearchDto[]>(
    `${API_ROOT}/vendors?${params.toString()}`,
  )
}

export function createPosVendor(input: {
  name: string
  phone?: string
  address?: string
}): Promise<PosVendorSearchDto> {
  return apiRequest<PosVendorSearchDto>(`${API_ROOT}/vendors`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
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

export function listSalesDrafts(): Promise<SalesDraftDto[]> {
  return apiRequest<SalesDraftDto[]>(`${API_ROOT}/sales/drafts?limit=10`)
}

export function getSalesDraft(draftId: string): Promise<SalesDraftDto> {
  return apiRequest<SalesDraftDto>(
    `${API_ROOT}/sales/drafts/${encodeURIComponent(draftId)}`,
  )
}

export function createSalesDraft(
  input: Pick<SalesDraftDto, 'customer' | 'discountPaisa' | 'payments' | 'note' | 'lines'>,
): Promise<SalesDraftDto> {
  return apiRequest<SalesDraftDto>(`${API_ROOT}/sales/drafts`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function archiveSalesDraft(
  draftId: string,
  expectedVersion: number,
): Promise<SalesDraftDto> {
  return apiRequest<SalesDraftDto>(
    `${API_ROOT}/sales/drafts/${encodeURIComponent(draftId)}/archive`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    },
  )
}

export function updateSalesDraft(
  draftId: string,
  expectedVersion: number,
  input: Pick<SalesDraftDto, 'customer' | 'discountPaisa' | 'payments' | 'note' | 'lines'>,
): Promise<SalesDraftDto> {
  return apiRequest<SalesDraftDto>(
    `${API_ROOT}/sales/drafts/${encodeURIComponent(draftId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ expectedVersion, ...input }),
    },
  )
}

export function postSalesDraft(
  draftId: string,
  expectedVersion: number,
  input: { operationId: string; businessDate: string },
): Promise<CommittedSaleDto> {
  return apiRequest<CommittedSaleDto>(
    `${API_ROOT}/sales/drafts/${encodeURIComponent(draftId)}/post`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion, ...input }),
    },
  )
}

export function listSalesTemplates(): Promise<SalesTemplateSummaryDto[]> {
  return apiRequest<SalesTemplateSummaryDto[]>(`${API_ROOT}/sales/templates`)
}

export function getSalesTemplate(templateId: string): Promise<SalesTemplateLoadedDto> {
  return apiRequest<SalesTemplateLoadedDto>(
    `${API_ROOT}/sales/templates/${encodeURIComponent(templateId)}`,
  )
}

export function createSalesTemplate(input: {
  name: string
  lines: SalesTemplateLineInputDto[]
}): Promise<SalesTemplateRecordDto> {
  return apiRequest<SalesTemplateRecordDto>(`${API_ROOT}/sales/templates`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function updateSalesTemplate(
  templateId: string,
  input: {
    expectedVersion: number
    name?: string
    lines?: SalesTemplateLineInputDto[]
  },
): Promise<SalesTemplateRecordDto> {
  return apiRequest<SalesTemplateRecordDto>(
    `${API_ROOT}/sales/templates/${encodeURIComponent(templateId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function duplicateSalesTemplate(
  templateId: string,
  name?: string,
): Promise<SalesTemplateRecordDto> {
  return apiRequest<SalesTemplateRecordDto>(
    `${API_ROOT}/sales/templates/${encodeURIComponent(templateId)}/duplicate`,
    { method: 'POST', body: JSON.stringify(name ? { name } : {}) },
  )
}

export function archiveSalesTemplate(
  templateId: string,
  expectedVersion: number,
): Promise<SalesTemplateRecordDto> {
  return apiRequest<SalesTemplateRecordDto>(
    `${API_ROOT}/sales/templates/${encodeURIComponent(templateId)}/archive`,
    { method: 'POST', body: JSON.stringify({ expectedVersion }) },
  )
}
