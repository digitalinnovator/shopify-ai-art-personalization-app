import { createServer, type Server } from 'node:http';
import { config } from '@aiart/core/config';

/** A minimal liveness endpoint — no framework needed for one route. */
export function startHealthServer(): Server {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(config('worker').WORKER_HEALTH_PORT);
  return server;
}
