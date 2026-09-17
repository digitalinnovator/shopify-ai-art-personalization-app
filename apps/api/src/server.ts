import { config } from '@aiart/core/config';
import { buildApp } from './app';

const app = await buildApp();
const { API_PORT } = config('api');

try {
  await app.listen({ port: API_PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
