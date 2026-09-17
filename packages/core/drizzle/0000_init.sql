CREATE TYPE "public"."design_status" AS ENUM('draft', 'live', 'archived');--> statement-breakpoint
CREATE TYPE "public"."design_type" AS ENUM('face_into_scene', 'style_transfer');--> statement-breakpoint
CREATE TYPE "public"."design_version_status" AS ENUM('draft', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('storefront', 'admin_test');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('uploaded', 'queued', 'generating', 'ready', 'partial', 'failed', 'selected', 'ordered', 'delivered', 'expired');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('received', 'processing', 'released', 'needs_attention', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."preview_slot" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."preview_status" AS ENUM('pending', 'submitted', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."selection_status" AS ENUM('selected', 'ordered', 'released', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'validated', 'rejected', 'deleted');--> statement-breakpoint
CREATE TABLE "design_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "design_version_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" "design_type" NOT NULL,
	"status" "design_status" DEFAULT 'draft' NOT NULL,
	"live_version_id" uuid,
	"shopify_product_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"design_id" uuid NOT NULL,
	"design_version_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"customer_id" text,
	"source" "job_source" DEFAULT 'storefront' NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"regenerations_used" integer DEFAULT 0 NOT NULL,
	"regeneration_limit" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"webhook_id" text NOT NULL,
	"triggered_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_item_id" text NOT NULL,
	"title" text,
	"token_hash" text NOT NULL,
	"selection_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"final_key" text,
	"released_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"shopify_order_id" text NOT NULL,
	"order_name" text,
	"customer_id" text,
	"customer_email" text,
	"financial_status" text,
	"status" "order_status" DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"slot" "preview_slot" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" "preview_status" DEFAULT 'pending' NOT NULL,
	"provider_request_id" text,
	"poll_url" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"original_key" text,
	"preview_key" text,
	"width" integer,
	"height" integer,
	"error" text,
	"error_kind" text,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"shop_domain" text NOT NULL,
	"topic" text NOT NULL,
	"customer_id" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"summary" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_settings" (
	"shop_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_settings_shop_id_provider_id_pk" PRIMARY KEY("shop_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"preview_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "selection_status" DEFAULT 'selected' NOT NULL,
	"ordered_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "selections_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"settings" jsonb NOT NULL,
	"uninstalled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shops_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"customer_id" text,
	"email" text,
	"source" "job_source" DEFAULT 'storefront' NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"label" text,
	"storage_key" text NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"mime" text,
	"bytes" integer,
	"width" integer,
	"height" integer,
	"sharpness" real,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_version" text NOT NULL,
	"rejection_reason" text,
	"upload_expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"topic" text,
	"shop_domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_selection_id_selections_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."selections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_settings" ADD CONSTRAINT "provider_settings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_preview_id_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."previews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "design_versions_design_version_uq" ON "design_versions" USING btree ("design_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "designs_shop_slug_uq" ON "designs" USING btree ("shop_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_active_upload_design_uq" ON "jobs" USING btree ("upload_id","design_id") WHERE source = 'storefront' AND status NOT IN ('failed', 'expired');--> statement-breakpoint
CREATE INDEX "jobs_status_updated_idx" ON "jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_shop_created_idx" ON "jobs" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_line_uq" ON "order_items" USING btree ("order_id","line_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_shop_order_uq" ON "orders" USING btree ("shop_id","shopify_order_id");--> statement-breakpoint
CREATE INDEX "orders_status_updated_idx" ON "orders" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "previews_job_round_slot_uq" ON "previews" USING btree ("job_id","round","slot");--> statement-breakpoint
CREATE INDEX "previews_status_updated_idx" ON "previews" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "previews_request_idx" ON "previews" USING btree ("provider","provider_request_id");--> statement-breakpoint
CREATE INDEX "selections_job_idx" ON "selections" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "uploads_shop_created_idx" ON "uploads" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "uploads_customer_idx" ON "uploads" USING btree ("shop_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_source_external_uq" ON "webhook_events" USING btree ("source","external_id");