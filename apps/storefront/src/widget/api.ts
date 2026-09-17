// Type-only import from the `statuses` subpath: nothing from `@aiart/contracts` may reach the
// runtime bundle (see the note at the top of widget.ts).
import type { PreviewSlot } from '@aiart/contracts/constants';
import type { JobStatus, PreviewStatus } from '@aiart/contracts/statuses';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface DesignPublic {
  id: string;
  name: string;
  type: string;
  exampleImages: string[];
  uploadRules: { maxBytes: number; minShortEdge: number; formats: string[] };
  regenerationsPerSession: number;
  requireEmail: boolean;
}

export interface PreviewView {
  id: string;
  slot: PreviewSlot;
  status: PreviewStatus;
  url?: string;
  error?: string | null;
  /** `refused` | `permanent` | `temporary` | `timeout` when the preview failed. */
  errorKind?: string | null;
}

export interface JobView {
  jobId: string;
  status: JobStatus;
  round: number;
  regenerationsLeft: number;
  previews: PreviewView[];
}

export type UploadResult = { ok: true; uploadId: string } | { ok: false; reason: string };

/**
 * One multipart POST through the app proxy: text fields first, the file last (the API reads the
 * fields that precede the file). XMLHttpRequest rather than fetch, for the upload progress events.
 */
function uploadWithProgress(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('photo', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      const body = xhr.response as UploadResult | { error?: { code?: string; message?: string } } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && 'ok' in body) return resolve(body);
      const error = body && 'error' in body ? body.error : undefined;
      reject(
        new ApiError(
          xhr.status,
          error?.code ?? 'upload_failed',
          error?.message ?? `Upload failed (${xhr.status})`,
        ),
      );
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed. Please check your connection.')));
    xhr.send(form);
  });
}

/** Talks to the backend through Shopify's app proxy at `basePath` (e.g. `/apps/ai-art`). */
export class ApiClient {
  constructor(
    private readonly basePath: string,
    private readonly sid: string,
  ) {}

  private url(path: string): string {
    const u = new URL(this.basePath.replace(/\/$/, '') + path, location.origin);
    u.searchParams.set('sid', this.sid);
    return u.pathname + u.search;
  }

  private async json<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        body?.error?.code ?? 'unknown_error',
        body?.error?.message ?? response.statusText,
      );
    }
    return response.json() as Promise<T>;
  }

  async getDesign(designId: string): Promise<DesignPublic> {
    return this.json(await fetch(this.url(`/designs/${designId}`)));
  }

  /** Uploads and validates the photo in one request; the result says whether it was accepted. */
  uploadPhoto(
    designId: string,
    file: File,
    opts: { consent: boolean; email?: string },
    onProgress: (fraction: number) => void,
  ): Promise<UploadResult> {
    const fields: Record<string, string> = { designId, consent: String(opts.consent) };
    if (opts.email) fields.email = opts.email;
    return uploadWithProgress(this.url('/uploads'), fields, file, onProgress);
  }

  async createJob(designId: string, uploadId: string): Promise<{ jobId: string }> {
    return this.json(
      await fetch(this.url('/previews'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ designId, uploadId }),
      }),
    );
  }

  async getJob(jobId: string): Promise<JobView> {
    return this.json(await fetch(this.url(`/previews/${jobId}`)));
  }

  async regenerate(jobId: string): Promise<JobView> {
    return this.json(await fetch(this.url(`/previews/${jobId}/regenerate`), { method: 'POST' }));
  }

  async select(jobId: string, previewId: string): Promise<{ selectionToken: string }> {
    return this.json(
      await fetch(this.url(`/previews/${jobId}/select`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ previewId }),
      }),
    );
  }
}
