/** Job lifecycle, as listed in the technical plan's "Job status values". */
export const JOB_STATUSES = [
  'uploaded',
  'queued',
  'generating',
  'ready',
  'partial',
  'failed',
  'selected',
  'ordered',
  'delivered',
  'expired',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses from which the customer may still regenerate or select. */
export const JOB_SETTLED_STATUSES = ['ready', 'partial', 'failed'] as const satisfies readonly JobStatus[];

/** Statuses a later generation round must never overwrite. */
export const JOB_TERMINAL_STATUSES = [
  'selected',
  'ordered',
  'delivered',
  'expired',
] as const satisfies readonly JobStatus[];

export const PREVIEW_STATUSES = ['pending', 'submitted', 'ready', 'failed'] as const;
export type PreviewStatus = (typeof PREVIEW_STATUSES)[number];

export const UPLOAD_STATUSES = ['pending', 'validated', 'rejected', 'deleted'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const SELECTION_STATUSES = ['selected', 'ordered', 'released', 'delivered'] as const;
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

export const ORDER_STATUSES = ['received', 'processing', 'released', 'needs_attention', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DESIGN_TYPES = ['face_into_scene', 'style_transfer'] as const;
export type DesignType = (typeof DESIGN_TYPES)[number];

export const DESIGN_STATUSES = ['draft', 'live', 'archived'] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const DESIGN_VERSION_STATUSES = ['draft', 'published', 'superseded'] as const;
export type DesignVersionStatus = (typeof DESIGN_VERSION_STATUSES)[number];

export const JOB_SOURCES = ['storefront', 'admin_test'] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const RELEASE_TRIGGERS = ['orders/create', 'orders/paid'] as const;
export type ReleaseTrigger = (typeof RELEASE_TRIGGERS)[number];
