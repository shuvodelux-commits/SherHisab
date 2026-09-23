import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  verifyPassword,
} from '../../src/modules/auth/password'

describe('password hashing', () => {
  it('uses a PBKDF2 iteration count supported by Cloudflare Workers', async () => {
    const password = 'strong-password-123'
    const storedHash = await hashPassword(password)
    const [, iterationsValue] = storedHash.split('$')

    expect(Number(iterationsValue)).toBeLessThanOrEqual(100_000)
    expect(await verifyPassword(password, storedHash)).toBe(true)
  })
})
