import { createServer } from 'node:http'

import handler from './api/sponsor'

/**
 * Local stand-in for the Vercel function: `bun run dev` serves POST /api/sponsor on :8787.
 * Bun loads `.env.local` automatically (see `.env.example` for the variables).
 */
const PORT = Number(process.env.PORT ?? 8787)

createServer((req, res) => {
  if (!req.url?.startsWith('/api/sponsor')) {
    res.statusCode = 404
    res.end()
    return
  }
  handler(req, res).catch((error: unknown) => {
    console.error('dev-server: unhandled error', error instanceof Error ? error.message : 'unknown')
    res.statusCode = 500
    res.end()
  })
}).listen(PORT, () => console.log(`sponsor-api dev server: http://localhost:${PORT}/api/sponsor`))
