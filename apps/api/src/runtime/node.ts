import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { app } from '../app'

export function startNodeServer(
  port = Number(process.env.PORT ?? 3000),
) {
  return serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(
        `SherHisab API listening on http://localhost:${info.port}`,
      )
    },
  )
}

const entryPoint = process.argv[1]

if (
  entryPoint &&
  fileURLToPath(import.meta.url) === resolve(entryPoint)
) {
  startNodeServer()
}
