import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('VPS deployment runtime', () => {
  it('initializes a fresh PostgreSQL volume with foundation migrations', async () => {
    const compose = await readFile(
      resolve(process.cwd(), '../../compose.vps.yaml'),
      'utf8',
    )

    expect(compose).toContain(
      './db/migrations:/docker-entrypoint-initdb.d:ro',
    )
  })
})
