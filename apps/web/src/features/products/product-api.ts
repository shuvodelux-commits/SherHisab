import { apiRequest } from '../../lib/api-client'
import type {
  CreateProductPayload,
  ProductCategoryDto,
  ProductDetailDto,
  ProductListFilters,
  ProductListResponse,
  ProductLotDto,
  ProductUnitDto,
  UpdateProductPayload,
} from './product-types'

const API_ROOT = '/api/private'

function productQueryString(filters: ProductListFilters): string {
  const params = new URLSearchParams()

  if (filters.search?.trim()) {
    params.set('search', filters.search.trim())
  }
  if (filters.categoryId?.trim()) {
    params.set('categoryId', filters.categoryId.trim())
  }
  if (filters.brand?.trim()) {
    params.set('brand', filters.brand.trim())
  }

  params.set('status', filters.status ?? 'active')
  if (filters.sortBy) {
    params.set('sortBy', filters.sortBy)
    params.set('sortDir', filters.sortDir ?? 'asc')
  }
  params.set('limit', String(filters.limit ?? 50))
  params.set('offset', String(filters.offset ?? 0))

  return params.toString()
}

export function listProducts(
  filters: ProductListFilters,
): Promise<ProductListResponse> {
  return apiRequest<ProductListResponse>(
    `${API_ROOT}/products?${productQueryString(filters)}`,
  )
}

export function getProduct(id: string): Promise<ProductDetailDto> {
  return apiRequest<ProductDetailDto>(`${API_ROOT}/products/${id}`)
}

export function listCategories(
  includeInactive = false,
): Promise<ProductCategoryDto[]> {
  const suffix = includeInactive ? '?includeInactive=true' : ''
  return apiRequest<ProductCategoryDto[]>(
    `${API_ROOT}/product-categories${suffix}`,
  )
}

export function createCategory(name: string): Promise<ProductCategoryDto> {
  return apiRequest<ProductCategoryDto>(
    `${API_ROOT}/product-categories`,
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    },
  )
}

export function updateCategory(
  id: string,
  name: string,
): Promise<ProductCategoryDto> {
  return apiRequest<ProductCategoryDto>(
    `${API_ROOT}/product-categories/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    },
  )
}

export function deleteCategory(id: string): Promise<void> {
  return apiRequest<void>(`${API_ROOT}/product-categories/${id}`, {
    method: 'DELETE',
  })
}

export function setCategoryStatus(
  id: string,
  isActive: boolean,
): Promise<ProductCategoryDto> {
  return apiRequest<ProductCategoryDto>(
    `${API_ROOT}/product-categories/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    },
  )
}

export function listUnits(
  includeInactive = false,
): Promise<ProductUnitDto[]> {
  const suffix = includeInactive ? '?includeInactive=true' : ''
  return apiRequest<ProductUnitDto[]>(`${API_ROOT}/units${suffix}`)
}

export function createUnit(input: {
  name: string
  symbol?: string | null
}): Promise<ProductUnitDto> {
  return apiRequest<ProductUnitDto>(`${API_ROOT}/units`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateUnit(
  id: string,
  input: { name: string; symbol?: string | null },
): Promise<ProductUnitDto> {
  return apiRequest<ProductUnitDto>(`${API_ROOT}/units/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteUnit(id: string): Promise<void> {
  return apiRequest<void>(`${API_ROOT}/units/${id}`, {
    method: 'DELETE',
  })
}

export function setUnitStatus(
  id: string,
  isActive: boolean,
): Promise<ProductUnitDto> {
  return apiRequest<ProductUnitDto>(`${API_ROOT}/units/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  })
}

export function createProduct(
  input: CreateProductPayload,
): Promise<ProductDetailDto> {
  return apiRequest<ProductDetailDto>(`${API_ROOT}/products`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateProduct(
  id: string,
  input: UpdateProductPayload,
): Promise<ProductDetailDto> {
  return apiRequest<ProductDetailDto>(`${API_ROOT}/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function setProductStatus(
  id: string,
  isActive: boolean,
): Promise<ProductDetailDto> {
  return apiRequest<ProductDetailDto>(
    `${API_ROOT}/products/${id}/status`,
    {
      method: 'POST',
      body: JSON.stringify({ isActive }),
    },
  )
}

export function adjustStock(
  id: string,
  input: Record<string, unknown>,
): Promise<ProductDetailDto> {
  return apiRequest<ProductDetailDto>(
    `${API_ROOT}/products/${id}/stock-adjustments`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export function listProductLots(
  id: string,
  variantId?: string,
): Promise<ProductLotDto[]> {
  const params = new URLSearchParams()
  if (variantId) {
    params.set('variantId', variantId)
  }
  const query = params.toString()

  return apiRequest<ProductLotDto[]>(
    `${API_ROOT}/products/${id}/lots${query ? `?${query}` : ''}`,
  )
}

export function replaceProductUnits(
  id: string,
  units: unknown[],
): Promise<unknown> {
  return apiRequest(`${API_ROOT}/products/${id}/units`, {
    method: 'PUT',
    body: JSON.stringify({ units }),
  })
}

export function replaceSpecifications(
  id: string,
  specifications: unknown[],
): Promise<unknown> {
  return apiRequest(`${API_ROOT}/products/${id}/specifications`, {
    method: 'PUT',
    body: JSON.stringify({ specifications }),
  })
}

export function replaceVariants(
  id: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest(`${API_ROOT}/products/${id}/variants`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}
