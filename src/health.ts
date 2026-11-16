// Health endpoint for Railway. GET /healthz is 200 once the gateway session
// is ready and 503 otherwise, so a deploy only goes live after login works.
import { createServer, type Server } from 'node:http'

export function startHealthServer(port: number, isReady: () => boolean): Server {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      const ok = isReady()
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'text/plain' })
      res.end(ok ? 'ok' : 'not ready')
      return
    }
    res.writeHead(404).end()
  })
  server.listen(port, () => console.log(`[health] listening on :${port}`))
  return server
}
