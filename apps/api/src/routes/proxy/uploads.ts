import { receiveUpload } from '@aiart/core/services';
import type { MultipartFields } from '@fastify/multipart';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireLiveDesign } from '../../lib/design';
import { badRequest } from '../../lib/errors';
import { requireProxyCtx } from '../../plugins/proxy-auth';

/**
 * The customer photo arrives here as one multipart request through Shopify's app proxy:
 * text fields first (designId, consent, email), then the file as `photo`. Sending it through the
 * proxy instead of straight to storage means the shop domain is the only origin the browser
 * talks to, so no storage CORS rules per store, and the proxy signature, session and rate limits
 * all apply before a single byte is kept.
 */
const FieldsSchema = z.object({
  designId: z.uuid(),
  /** The consent checkbox on the storefront block; anything but "true" fails validation. */
  consent: z.literal('true'),
  email: z.email().optional(),
});

const UploadResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    uploadId: z.uuid(),
    width: z.number().nullable(),
    height: z.number().nullable(),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

/** Multipart text fields as plain strings (a repeated field keeps its first value). */
function textFields(fields: MultipartFields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, part] of Object.entries(fields)) {
    const first = Array.isArray(part) ? part[0] : part;
    if (first && first.type === 'field' && typeof first.value === 'string') out[name] = first.value;
  }
  return out;
}

export const uploadsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/uploads', { schema: { response: { 200: UploadResponseSchema } } }, async (request) => {
    const ctx = requireProxyCtx(request);
    if (!request.isMultipart()) {
      throw badRequest('multipart_required', 'Send the photo as multipart/form-data');
    }
    const part = await request.file();
    if (!part || part.fieldname !== 'photo') {
      throw badRequest('photo_required', 'Send the photo in a field named "photo", after the text fields');
    }

    const parsed = FieldsSchema.safeParse(textFields(part.fields));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw badRequest(
        'invalid_fields',
        issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid fields',
      );
    }
    const { designId, email } = parsed.data;
    const { config } = await requireLiveDesign(ctx.shopId, designId);

    // The plugin's file size limit is the schema's ceiling; the design's own rule is checked
    // by validation, which reports `too_large` like any other rejection.
    const bytes = await part.toBuffer();
    if (part.file.truncated) return { ok: false as const, reason: 'too_large' };

    const result = await receiveUpload({
      shopId: ctx.shopId,
      sessionId: ctx.sessionId,
      customerId: ctx.customerId,
      email,
      bytes,
      rules: config.uploadRules,
    });
    if (!result.ok) return { ok: false as const, reason: result.reason };
    return {
      ok: true as const,
      uploadId: result.upload.id,
      width: result.upload.width,
      height: result.upload.height,
    };
  });
};
