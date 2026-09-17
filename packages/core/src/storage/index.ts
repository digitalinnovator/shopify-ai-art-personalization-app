import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

export * from './keys';

let internalClient: S3Client | undefined;
let publicClient: S3Client | undefined;

function makeClient(endpoint: string): S3Client {
  const c = config('storage');
  return new S3Client({
    endpoint,
    region: c.S3_REGION,
    forcePathStyle: c.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY },
    // Newer SDKs add CRC32 checksums to every request; some S3-compatible servers reject them.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** Client the servers use to talk to storage. */
function s3(): S3Client {
  internalClient ??= makeClient(config('storage').S3_ENDPOINT);
  return internalClient;
}

/** Client used only for signing URLs that browsers will open. */
function s3Public(): S3Client {
  const c = config('storage');
  publicClient ??= makeClient(c.S3_PUBLIC_ENDPOINT ?? c.S3_ENDPOINT);
  return publicClient;
}

export function bucketName(): string {
  return config('storage').S3_BUCKET;
}

/** Test helper: drop cached clients after changing storage env vars. */
export function resetStorageClients(): void {
  internalClient?.destroy();
  publicClient?.destroy();
  internalClient = undefined;
  publicClient = undefined;
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof S3ServiceException &&
    (err.$metadata.httpStatusCode === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey')
  );
}

export async function ensureBucket(): Promise<'created' | 'exists'> {
  const Bucket = bucketName();
  try {
    await s3().send(new HeadBucketCommand({ Bucket }));
    return 'exists';
  } catch (err) {
    if (!isNotFound(err)) throw err;
    await s3().send(new CreateBucketCommand({ Bucket }));
    return 'created';
  }
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: body, ContentType: contentType }),
  );
}

export class ObjectTooLargeError extends Error {
  override name = 'ObjectTooLargeError';
}

/** Reads an object into memory. Returns undefined when it does not exist. */
export async function getObject(key: string, maxBytes = 50 * 1024 * 1024): Promise<Buffer | undefined> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
    if ((res.ContentLength ?? 0) > maxBytes) {
      res.Body?.transformToWebStream().cancel();
      throw new ObjectTooLargeError(`${key} is ${res.ContentLength} bytes (limit ${maxBytes})`);
    }
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : undefined;
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | undefined> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

export async function copyObject(fromKey: string, toKey: string): Promise<void> {
  const Bucket = bucketName();
  await s3().send(
    new CopyObjectCommand({ Bucket, Key: toKey, CopySource: `${Bucket}/${encodeURI(fromKey)}` }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const Bucket = bucketName();
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    if (batch.length === 0) continue;
    await s3().send(
      new DeleteObjectsCommand({ Bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
    );
  }
}

export async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let ContinuationToken: string | undefined;
  do {
    const res = await s3().send(
      new ListObjectsV2Command({ Bucket: bucketName(), Prefix: prefix, ContinuationToken }),
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

/** Deletes every object under a prefix, e.g. `shops/<id>/` for a shop redact request. */
export async function deletePrefix(prefix: string): Promise<number> {
  const keys = await listKeys(prefix);
  await deleteObjects(keys);
  return keys.length;
}

/**
 * Short-lived download link. The signing time is rounded down to `stableForSeconds`, so repeated
 * calls inside that window return the same URL (no image reloads while the widget polls). The link
 * stays valid for at least `expiresSeconds`.
 */
export async function presignDownload(
  key: string,
  opts: { expiresSeconds?: number; stableForSeconds?: number; downloadName?: string } = {},
): Promise<string> {
  const expiresSeconds = opts.expiresSeconds ?? 600;
  const stable = opts.stableForSeconds ?? 300;
  const now = Date.now();
  const signingDate = new Date(Math.floor(now / (stable * 1000)) * stable * 1000);
  const command = new GetObjectCommand({
    Bucket: bucketName(),
    Key: key,
    ...(opts.downloadName
      ? { ResponseContentDisposition: `attachment; filename="${opts.downloadName.replace(/"/g, '')}"` }
      : {}),
  });
  // SigV4 links cannot outlive 7 days.
  const expiresIn = Math.min(expiresSeconds + stable, 7 * 24 * 3600);
  return getSignedUrl(s3Public(), command, { expiresIn, signingDate });
}
