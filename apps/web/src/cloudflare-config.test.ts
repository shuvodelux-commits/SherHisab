import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

function wranglerConfigPath(): string {
  return resolve(cwd(), '../../wrangler.jsonc')
}

describe('Cloudflare deployment configuration', () => {
  it('routes API requests through the Worker and keeps SPA fallback', async () => {
    const config = JSON.parse(
      await readFile(wranglerConfigPath(), 'utf8'),
    ) as {
      main?: string
      compatibility_date?: string
      compatibility_flags?: string[]
      assets?: {
        not_found_handling?: string
        run_worker_first?: string[]
      }
    }

    expect(config.main).toBe('./apps/api/src/runtime/cloudflare.ts')
    expect(config.compatibility_date).toBe('2026-09-22')
    expect(config.compatibility_flags).toContain('nodejs_compat')
    expect(config.assets?.not_found_handling).toBe(
      'single-page-application',
    )
    expect(config.assets?.run_worker_first).toContain('/api/*')
  })
})
