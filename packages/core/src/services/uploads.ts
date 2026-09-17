import { randomUUID } from 'node:crypto';
import type { UploadRules } from '@aiart/contracts';
import { CONSENT_VERSION } from '@aiart/contracts';
import { and, eq } from 'drizzle-orm';
import { db, type Upload, uploads } from '../db';
import { normalizePhoto } from '../images/normalize';
import { type RejectionReason, validatePhoto } from '../images/validate';
import { putObject, storageKeys } from '../storage';

export interface ReceiveUploadInput {
  shopId: string;
  sessionId: string;
  customerId?: string;
  email?: string;
  /** The photo exactly as the browser sent it. */
  bytes: Buffer;
  rules: UploadRules;
}

export type ReceiveUploadResult = { ok: true; upload: Upload } | { ok: false; reason: RejectionReason };

/**
 * Takes a customer photo that arrived through the app proxy, validates it, normalizes it
 * (auto-orient, strip metadata, re-encode) and stores only the normalized copy. The raw bytes
 * never reach storage: they may carry GPS/EXIF data, and once normalized or rejected they are
 * not needed. A rejected upload keeps its row (status and reason) for the admin's statistics.
 *
 * Photos come through the app proxy rather than straight from the browser to storage, so no
 * storage CORS setup is needed per store and every upload passes the proxy signature, the
 * session and the rate limits first.
 */
export async function receiveUpload(input: ReceiveUploadInput): Promise<ReceiveUploadResult> {
  const uploadId = randomUUID();
  const photoKey = storageKeys.uploadPhoto(input.shopId, uploadId);
  await db().insert(uploads).values({
    id: uploadId,
    shopId: input.shopId,
    sessionId: input.sessionId,
    customerId: input.customerId,
    email: input.email,
    storageKey: photoKey,
    status: 'pending',
    consentAt: new Date(),
    consentVersion: CONSENT_VERSION,
  });

  const result = await validatePhoto(input.bytes, input.rules);
  if (!result.ok) {
    await db()
      .update(uploads)
      .set({ status: 'rejected', rejectionReason: result.reason })
      .where(eq(uploads.id, uploadId));
    return { ok: false, reason: result.reason };
  }

  const normalized = await normalizePhoto(input.bytes);
  await putObject(photoKey, normalized.buffer, 'image/jpeg');
  const [updated] = await db()
    .update(uploads)
    .set({
      status: 'validated',
      mime: 'image/jpeg',
      bytes: normalized.buffer.length,
      width: normalized.width,
      height: normalized.height,
      sharpness: result.sharpness,
    })
    .where(eq(uploads.id, uploadId))
    .returning();
  return { ok: true, upload: updated! };
}

export async function getUpload(shopId: string, uploadId: string): Promise<Upload | undefined> {
  const [row] = await db()
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.shopId, shopId)));
  return row;
}

/** Seeded sample photos used by the admin's "run test" feature. */
export async function listSampleUploads(shopId: string): Promise<Upload[]> {
  return db()
    .select()
    .from(uploads)
    .where(and(eq(uploads.shopId, shopId), eq(uploads.isSample, true)));
}
