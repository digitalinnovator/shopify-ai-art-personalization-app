import { UploadRulesSchema } from '@aiart/contracts';
import { getShop } from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireLiveDesign } from '../../lib/design';
import { requireProxyCtx } from '../../plugins/proxy-auth';

const ParamsSchema = z.object({ designId: z.uuid() });

const ResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  exampleImages: z.array(z.url()),
  uploadRules: UploadRulesSchema,
  regenerationsPerSession: z.number(),
  requireEmail: z.boolean(),
});

export const designsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/designs/:designId',
    { schema: { params: ParamsSchema, response: { 200: ResponseSchema } } },
    async (request) => {
      const ctx = requireProxyCtx(request);
      const { design, config } = await requireLiveDesign(ctx.shopId, request.params.designId);
      const shop = await getShop(ctx.shopId);

      const exampleImages = await Promise.all(
        config.exampleImages.map((key) =>
          presignDownload(key, { expiresSeconds: 3600, stableForSeconds: 900 }),
        ),
      );

      return {
        id: design.id,
        name: design.name,
        type: design.type,
        exampleImages,
        uploadRules: config.uploadRules,
        regenerationsPerSession: config.limits.regenerationsPerSession,
        requireEmail: shop?.settings.requireEmail ?? false,
      };
    },
  );
};
