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

  it('binds the preview Worker to the SherHisab Hyperdrive database', async () => {
    const config = JSON.parse(
      await readFile(wranglerConfigPath(), 'utf8'),
    ) as {
      hyperdrive?: Array<{
        binding?: string
        id?: string
      }>
    }

    expect(config.hyperdrive).toHaveLength(1)
    expect(config.hyperdrive?.[0]).toMatchObject({
      binding: 'HYPERDRIVE',
      id: 'ddc324c21cc641c990ef64df307c9476',
    })
  })
})

describe('Cloudflare developer workflow', () => {
  it('provides simple local development and deployment commands', async () => {
    const rootPackage = JSON.parse(
      await readFile(resolve(cwd(), '../../package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>
    }

    const webPackage = JSON.parse(
      await readFile(resolve(cwd(), 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>
    }

    expect(rootPackage.scripts?.['dev:cloudflare']).toBe(
      'pnpm --filter @sherhisab/web dev',
    )
    expect(rootPackage.scripts?.['deploy:cloudflare']).toBe(
      'pnpm --filter @sherhisab/web run deploy',
    )
    expect(webPackage.scripts?.deploy).toBe(
      'pnpm run build && wrangler deploy --config dist/sherhisab/wrangler.json',
    )
  })

  it('uses the local SherHisab database during Cloudflare development', async () => {
    const config = JSON.parse(
      await readFile(wranglerConfigPath(), 'utf8'),
    ) as {
      hyperdrive?: Array<{
        binding?: string
        localConnectionString?: string
      }>
    }

    expect(config.hyperdrive?.[0]).toMatchObject({
      binding: 'HYPERDRIVE',
      localConnectionString:
        'postgresql://sherhisab:sherhisab@localhost:5432/sherhisab',
    })
  })
})
