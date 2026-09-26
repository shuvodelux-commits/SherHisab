import { apiRequest } from '../lib/api-client'

export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF'

export type PermissionKey =
  | 'SALES_OVERRIDE_SELLING_PRICE'
  | 'SALES_TEMPLATE_VIEW'
  | 'SALES_TEMPLATE_MANAGE'
  | 'INVENTORY_EDIT_LOT_SELLING_PRICE'

export interface AuthSession {
  authenticated: true
  userId: string
  tenantId: string
  role: UserRole
  permissions: PermissionKey[]
  expiresAt: string
}

export interface LoginInput {
  tenantSlug: string
  email: string
  password: string
}

export async function getSession(): Promise<AuthSession | null> {
  const response = await fetch('/api/auth/session', {
    credentials: 'include',
  })

  if (response.status === 401) {
    return null
  }

  const text = await response.text()
  let body: unknown = null

  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = text
    }
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed with status ${response.status}`

    throw new Error(message)
  }

  return body as AuthSession
}

export function login(input: LoginInput): Promise<{
  userId: string
  tenantId: string
  expiresAt: string
}> {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
