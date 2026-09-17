// Status vocabulary → badge tone and human label. Pure and client-safe. Every status the app can
// display is listed here explicitly; `test/status.test.ts` fails if a contracts status is missing.

export type Tone = 'success' | 'info' | 'attention' | 'warning' | 'critical' | 'new' | 'neutral';

export type StatusKind =
  | 'job'
  | 'preview'
  | 'upload'
  | 'selection'
  | 'order'
  | 'orderItem'
  | 'design'
  | 'version'
  | 'privacy'
  | 'topic'
  | 'provider'
  | 'source'
  | 'errorKind';

const BASE: Record<string, Tone> = {
  // job
  uploaded: 'info',
  queued: 'info',
  generating: 'info',
  ready: 'success',
  partial: 'warning',
  failed: 'critical',
  selected: 'new',
  ordered: 'new',
  delivered: 'success',
  expired: 'neutral',
  // preview
  pending: 'info',
  submitted: 'info',
  // upload
  validated: 'success',
  rejected: 'critical',
  deleted: 'neutral',
  // selection / order / order item
  released: 'success',
  received: 'info',
  processing: 'info',
  needs_attention: 'attention',
  cancelled: 'neutral',
  revoked: 'neutral',
  // design / version
  draft: 'info',
  live: 'success',
  archived: 'neutral',
  published: 'success',
  superseded: 'neutral',
  // privacy
  completed: 'success',
  // provider
  enabled: 'success',
  disabled: 'neutral',
  configured: 'success',
  not_configured: 'warning',
  // job source
  storefront: 'neutral',
  admin_test: 'info',
  // preview error kind
  refused: 'warning',
  permanent: 'critical',
  temporary: 'attention',
  timeout: 'attention',
  // privacy topics
  'customers/data_request': 'info',
  'customers/redact': 'warning',
  'shop/redact': 'critical',
};

const OVERRIDES: Partial<Record<StatusKind, Record<string, Tone>>> = {
  privacy: { received: 'attention' },
};

const LABELS: Record<string, string> = {
  needs_attention: 'Needs attention',
  admin_test: 'Test run',
  storefront: 'Storefront',
  not_configured: 'Not configured',
  'customers/data_request': 'Data request',
  'customers/redact': 'Customer redact',
  'shop/redact': 'Shop redact',
  refused: 'Refused by provider',
  permanent: 'Permanent error',
  temporary: 'Temporary error',
  timeout: 'Timed out',
};

/** Statuses that mean "something is happening right now". */
const ACTIVE = new Set(['queued', 'generating', 'submitted', 'processing']);

export function hasStatusTone(status: string, kind?: StatusKind): boolean {
  return Boolean((kind && OVERRIDES[kind]?.[status]) || BASE[status]);
}

export function statusTone(status: string, kind?: StatusKind): Tone {
  return (kind && OVERRIDES[kind]?.[status]) ?? BASE[status] ?? 'neutral';
}

export function statusLabel(status: string): string {
  const known = LABELS[status];
  if (known) return known;
  const words = status.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function statusIsActive(status: string): boolean {
  return ACTIVE.has(status);
}

export function designTypeLabel(type: string): string {
  return type === 'face_into_scene' ? 'Face into scene' : 'Style transfer';
}
