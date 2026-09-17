import { config } from '@aiart/core/config';
import { logger } from '@aiart/core/logger';
import { registerLiveProviders } from '@aiart/core/providers';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { installErrorHandler } from './plugins/error-handler';
import { installProxyAuth } from './plugins/proxy-auth';
import { installProxyRateLimit } from './plugins/proxy-rate-limit';
import { installRawBodyParser } from './plugins/webhooks-raw-body';
import { healthRoutes } from './routes/health';
import { designsRoutes } from './routes/proxy/designs';
import { previewsRoutes } from './routes/proxy/previews';
import { uploadsRoutes } from './routes/proxy/uploads';
import { aiProviderWebhookRoutes } from './routes/webhooks/ai-provider';
import { shopifyOrdersRoutes } from './routes/webhooks/shopify-orders';
import { shopifyPrivacyRoutes } from './routes/webhooks/shopify-privacy';

export async function buildApp(): Promise<FastifyInstance> {
  registerLiveProviders();

  // Cast: pino's own `Logger` type and Fastify's `FastifyBaseLogger` interface have drifted apart
  // slightly across their latest versions (an extra `msgPrefix` requirement). A pino instance is
  // Fastify's documented way to plug in a logger, so this narrows back to the type Fastify expects.
  const app = Fastify({
    loggerInstance: logger('api') as unknown as FastifyBaseLogger,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandler(app);

  await app.register(swagger, {
    openapi: {
      info: { title: 'AI Art Preview API', version: '0.1.0' },
      servers: [{ url: config('api').API_PUBLIC_URL }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes);

  await app.register(
    async (proxyScope) => {
      installProxyAuth(proxyScope);
      await installProxyRateLimit(proxyScope);
      // Customer photos arrive as multipart through the app proxy (routes/proxy/uploads.ts). The
      // file limit is the ceiling any design may configure; the design's own rule applies after.
      await proxyScope.register(multipart, {
        limits: { files: 1, fileSize: 25 * 1024 * 1024, fields: 8, fieldSize: 2048 },
      });
      await proxyScope.register(designsRoutes);
      await proxyScope.register(uploadsRoutes);
      await proxyScope.register(previewsRoutes);
    },
    { prefix: '/proxy' },
  );

  await app.register(
    async (webhooksScope) => {
      installRawBodyParser(webhooksScope);
      await webhooksScope.register(shopifyOrdersRoutes);
      await webhooksScope.register(shopifyPrivacyRoutes);
      await webhooksScope.register(aiProviderWebhookRoutes);
    },
    { prefix: '/webhooks' },
  );

  return app;
}
