export const SESSION_COOKIE_NAME = 'sherhisab_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createSessionToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )

  return bytesToHex(new Uint8Array(digest))
}

export function getSessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)
}
