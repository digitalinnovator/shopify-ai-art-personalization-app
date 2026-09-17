import {
  DESIGN_STATUSES,
  DESIGN_TYPES,
  DESIGN_VERSION_STATUSES,
  type DesignConfig,
  JOB_SOURCES,
  JOB_STATUSES,
  ORDER_STATUSES,
  PREVIEW_SLOTS,
  PREVIEW_STATUSES,
  SELECTION_STATUSES,
  type ShopSettings,
  UPLOAD_STATUSES,
} from '@aiart/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const jobStatus = pgEnum('job_status', JOB_STATUSES);
export const jobSource = pgEnum('job_source', JOB_SOURCES);
export const previewStatus = pgEnum('preview_status', PREVIEW_STATUSES);
export const previewSlot = pgEnum('preview_slot', PREVIEW_SLOTS);
export const uploadStatus = pgEnum('upload_status', UPLOAD_STATUSES);
export const selectionStatus = pgEnum('selection_status', SELECTION_STATUSES);
export const orderStatus = pgEnum('order_status', ORDER_STATUSES);
export const designType = pgEnum('design_type', DESIGN_TYPES);
export const designStatus = pgEnum('design_status', DESIGN_STATUSES);
export const designVersionStatus = pgEnum('design_version_status', DESIGN_VERSION_STATUSES);

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () =>
  ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const shops = pgTable('shops', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull().unique(),
  settings: jsonb('settings').$type<ShopSettings>().notNull(),
  uninstalledAt: ts('uninstalled_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const designs = pgTable(
  'designs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    type: designType('type').notNull(),
    status: designStatus('status').notNull().default('draft'),
    /** The published version the storefront uses. Not a FK to avoid a designs ↔ versions cycle. */
    liveVersionId: uuid('live_version_id'),
    shopifyProductIds: text('shopify_product_ids').array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('designs_shop_slug_uq').on(t.shopId, t.slug)],
);

export const designVersions = pgTable(
  'design_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    designId: uuid('design_id')
      .notNull()
      .references(() => designs.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: designVersionStatus('status').notNull().default('draft'),
    config: jsonb('config').$type<DesignConfig>().notNull(),
    note: text('note'),
    createdAt: createdAt(),
    publishedAt: ts('published_at'),
  },
  (t) => [uniqueIndex('design_versions_design_version_uq').on(t.designId, t.version)],
);

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    /** Random id from the shopper's browser; a bearer secret, never logged. */
    sessionId: text('session_id').notNull(),
    /** Shopify customer id from the signed app proxy request, when the shopper is logged in. */
    customerId: text('customer_id'),
    email: text('email'),
    source: jobSource('source').notNull().default('storefront'),
    /** Seeded sample photos used by admin test runs. */
    isSample: boolean('is_sample').notNull().default(false),
    label: text('label'),
    storageKey: text('storage_key').notNull(),
    status: uploadStatus('status').notNull().default('pending'),
    mime: text('mime'),
    bytes: integer('bytes'),
    width: integer('width'),
    height: integer('height'),
    sharpness: real('sharpness'),
    consentAt: ts('consent_at').notNull(),
    consentVersion: text('consent_version').notNull(),
    rejectionReason: text('rejection_reason'),
    uploadExpiresAt: ts('upload_expires_at'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('uploads_shop_created_idx').on(t.shopId, t.createdAt),
    index('uploads_customer_idx').on(t.shopId, t.customerId),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    designId: uuid('design_id')
      .notNull()
      .references(() => designs.id),
    designVersionId: uuid('design_version_id')
      .notNull()
      .references(() => designVersions.id),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => uploads.id),
    sessionId: text('session_id').notNull(),
    customerId: text('customer_id'),
    source: jobSource('source').notNull().default('storefront'),
    status: jobStatus('status').notNull().default('queued'),
    /** Current generation round; regenerating increments it. Only the current round's previews count. */
    round: integer('round').notNull().default(1),
    regenerationsUsed: integer('regenerations_used').notNull().default(0),
    /** Snapshot of the design version's limit when the job was created. */
    regenerationLimit: integer('regeneration_limit').notNull(),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One active storefront job per photo and design; admin test runs and failed or expired jobs are exempt.
    uniqueIndex('jobs_active_upload_design_uq')
      .on(t.uploadId, t.designId)
      .where(sql`source = 'storefront' AND status NOT IN ('failed', 'expired')`),
    index('jobs_status_updated_idx').on(t.status, t.updatedAt),
    index('jobs_shop_created_idx').on(t.shopId, t.createdAt),
  ],
);

export const previews = pgTable(
  'previews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    slot: previewSlot('slot').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    status: previewStatus('status').notNull().default('pending'),
    /** Provider request id while waiting for a webhook or poll. Callbacks must match it. */
    providerRequestId: text('provider_request_id'),
    /** Where to fetch the result, stored at submit time. Never taken from a callback body. */
    pollUrl: text('poll_url'),
    attempts: integer('attempts').notNull().default(0),
    originalKey: text('original_key'),
    previewKey: text('preview_key'),
    width: integer('width'),
    height: integer('height'),
    error: text('error'),
    /** `temporary` | `permanent` | `refused` | `timeout` */
    errorKind: text('error_kind'),
    submittedAt: ts('submitted_at'),
    completedAt: ts('completed_at'),
    durationMs: integer('duration_ms'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('previews_job_round_slot_uq').on(t.jobId, t.round, t.slot),
    index('previews_status_updated_idx').on(t.status, t.updatedAt),
    index('previews_request_idx').on(t.provider, t.providerRequestId),
  ],
);

export const selections = pgTable(
  'selections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    previewId: uuid('preview_id')
      .notNull()
      .references(() => previews.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token given to the browser. The token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    status: selectionStatus('status').notNull().default('selected'),
    orderedAt: ts('ordered_at'),
    releasedAt: ts('released_at'),
    deliveredAt: ts('delivered_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('selections_job_idx').on(t.jobId)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    shopifyOrderId: text('shopify_order_id').notNull(),
    orderName: text('order_name'),
    customerId: text('customer_id'),
    customerEmail: text('customer_email'),
    financialStatus: text('financial_status'),
    status: orderStatus('status').notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    cancelledAt: ts('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_shop_order_uq').on(t.shopId, t.shopifyOrderId),
    index('orders_status_updated_idx').on(t.status, t.updatedAt),
  ],
);

/** Every Shopify order webhook (create / paid / cancelled) is kept and processed on its own. */
export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    webhookId: text('webhook_id').notNull(),
    triggeredAt: ts('triggered_at'),
    payload: jsonb('payload').notNull(),
    processedAt: ts('processed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId)],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    lineItemId: text('line_item_id').notNull(),
    title: text('title'),
    /** Copies ordered of this personalized item (the theme's quantity box). */
    quantity: integer('quantity').notNull().default(1),
    tokenHash: text('token_hash').notNull(),
    selectionId: uuid('selection_id').references(() => selections.id, { onDelete: 'set null' }),
    /** `pending` | `released` | `needs_attention` | `revoked` */
    status: text('status').notNull().default('pending'),
    finalKey: text('final_key'),
    releasedAt: ts('released_at'),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('order_items_order_line_uq').on(t.orderId, t.lineItemId)],
);

/** De-duplication of Shopify webhook deliveries (X-Shopify-Webhook-Id). */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    topic: text('topic'),
    shopDomain: text('shop_domain'),
    receivedAt: createdAt(),
  },
  (t) => [uniqueIndex('webhook_events_source_external_uq').on(t.source, t.externalId)],
);

export const privacyRequests = pgTable('privacy_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'set null' }),
  shopDomain: text('shop_domain').notNull(),
  topic: text('topic').notNull(),
  customerId: text('customer_id'),
  payload: jsonb('payload').notNull(),
  /** `received` | `completed` */
  status: text('status').notNull().default('received'),
  summary: text('summary'),
  completedAt: ts('completed_at'),
  createdAt: createdAt(),
});

export const providerSettings = pgTable(
  'provider_settings',
  {
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.shopId, t.providerId] })],
);

/**
 * Shopify app sessions (access tokens per shop), owned by `@shopify/shopify-app-session-storage-drizzle`
 * on the admin's behalf. Columns are the full set that adapter reads and writes; only the first
 * eight are required by it, the rest hold online-session and expiring-token details when present.
 */
// Column names are camelCase (unlike the rest of the schema) because the adapter's TypeScript
// types pin them to exactly these names.
export const shopifySessions = pgTable('shopify_sessions', {
  id: text('id').primaryKey(),
  shop: text('shop').notNull(),
  state: text('state').notNull(),
  isOnline: boolean('isOnline').notNull().default(false),
  scope: text('scope'),
  expires: timestamp('expires', { mode: 'date' }),
  accessToken: text('accessToken').notNull(),
  userId: bigint('userId', { mode: 'number' }),
  firstName: text('firstName'),
  lastName: text('lastName'),
  email: text('email'),
  accountOwner: boolean('accountOwner'),
  locale: text('locale'),
  collaborator: boolean('collaborator'),
  emailVerified: boolean('emailVerified'),
  refreshToken: text('refreshToken'),
  refreshTokenExpires: timestamp('refreshTokenExpires', { mode: 'date' }),
});

export type Shop = typeof shops.$inferSelect;
export type Design = typeof designs.$inferSelect;
export type DesignVersion = typeof designVersions.$inferSelect;
export type Upload = typeof uploads.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Preview = typeof previews.$inferSelect;
export type Selection = typeof selections.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type PrivacyRequest = typeof privacyRequests.$inferSelect;
