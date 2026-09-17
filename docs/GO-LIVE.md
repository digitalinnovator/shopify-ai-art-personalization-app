# Going live

Everything in this repository runs locally against a mock AI provider. This is the checklist for
plugging in the four things that need external resources, in the order you'd typically get them.

## 1. Shopify Partner account and development store

**Unlocks:** app install, the theme block on a real product page, the real app proxy, real
webhooks, cart and checkout testing.

1. Create a [Partner account](https://partners.shopify.com) and a development store
   (`shopify store create dev` via the Shopify CLI, or from the Partner dashboard).
2. Start the local services and the API + worker as usual (`pnpm bootstrap` once, then `pnpm dev`
   for the API and worker — the admin is started by the CLI in the next step, not by `pnpm dev`).
3. From `apps/shopify-app`, run `pnpm exec shopify app dev --store <your-store>.myshopify.com`
   (the Shopify CLI is a devDependency there). First run: it opens the browser to log in to the
   Partner account, asks whether to create the app (yes) and which store — then it creates the
   app, opens a tunnel, installs the app on the dev store and **rewrites `shopify.app.toml`** with
   the real `client_id` (it may blank `scopes`; put `read_orders` back if so). The tunnel is applied
   to the application URL, redirect URLs and app-proxy URL of the dev version only, so the
   placeholders in the file stay until you set the real host for deploy (section 3). The CLI hands the tunnel URL,
   client id, secret and scopes to the dev server as environment variables (it does not write a
   `.env` file any more); `scripts/dev-shopify.mjs` saves them to the gitignored
   `apps/shopify-app/.env` for the next step and maps the CLI's `HOST` to `SHOPIFY_APP_URL`.
   - What the CLI runs is `shopify.web.toml` → `pnpm dev:shopify` → the normal dev server with
     `AUTH_MODE=shopify` forced on, so the embedded admin authenticates through
     `@shopify/shopify-app-react-router` (`app/shopify.server.ts`, `app/routes/auth.*`). Sessions
     live in the `shopify_sessions` table (migration `0001`). The mock `/login` stays for `pnpm dev`.
   - **Customer photos travel through the app proxy** (`POST /proxy/uploads`, multipart), not
     straight from the browser to storage. The shop domain is the only origin the browser talks to,
     so no storage CORS rules are needed per store, and the proxy signature, session and rate limits
     apply before a byte is kept. The widget shrinks photos above 2048 px in the browser first.
     Presigned storage links are still used for reading images (examples, previews, thumbnails).
   - **There is one tunnel, pointed at the admin.** Shopify sends app-proxy and webhook traffic to
     the app URL too, so the admin's dev server forwards `/proxy/*` and `/webhooks/*` to the API
     (`vite.config.ts` → `server.proxy`). In production put both behind one host the same way.
   - **Order webhooks need "Protected customer data" access.** `orders/*` topics carry customer
     details, and the dev preview refuses to start until the app has requested that access: Dev
     Dashboard → the app → **API access** → **Protected customer data access** → Request → select
     "Protected customer data" → Save. Development stores get it immediately; public listing
     needs Shopify's review. Until then the `orders` subscription in `shopify.app.toml` is
     commented out; remove the `# ` prefixes once access is granted and run `shopify app dev` again.
4. Run `pnpm shopify:sync-env` (repo root) once the dev server has started under the CLI: it copies
   `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`/`SHOPIFY_APP_URL`/scopes into the repo-root `.env`, which
   is what the API and worker read — they need the same client secret to verify app-proxy
   signatures and webhook HMACs. It also points `S3_PUBLIC_ENDPOINT` at the tunnel, because the
   Shopify page is https and cannot load images from the local MinIO over http: the admin dev
   server forwards the bucket path (`/<S3_BUCKET>/...`) to MinIO with the Host header intact, so
   presigned links keep verifying. Restart the API and worker afterwards. The tunnel URL changes on
   every `shopify app dev` run, so repeat this when it changes. Working without the tunnel again?
   Set `S3_PUBLIC_ENDPOINT=http://localhost:9000` back. In production a public https storage
   endpoint (S3, R2) replaces all of this.
5. Add the theme block (below "Buy buttons" in the product information section). Its setting
   **"Hide the theme's buy buttons"** is on by default: the theme's Add to cart and Buy it now
   buttons are hidden and a theme form submit is blocked, so a personalized product can only be
   bought from the block after choosing a preview (an order line without a chosen preview has no
   artwork to release). The block reads size and quantity from the theme's product form.
   To add it: in the dev store's theme editor, open a product template, add "AI Art
   Preview" (built from `apps/shopify-app/extensions/ai-art-preview/`) and set its Design ID to a
   real design's id (copy it from the admin's Designs screen URL).
6. Build the widget and copy it into the extension before deploying: `pnpm --filter
   @aiart/storefront build:widget`, then copy `apps/storefront/dist-widget/*` into
   `apps/shopify-app/extensions/ai-art-preview/assets/` (those two files are gitignored since
   they're generated — add a script for this once it's a routine step).
6. Confirm the theme is Online Store 2.0 (JSON templates) — required for app blocks.

## 2. AI provider API keys

**Unlocks:** real image generation, model comparison, prompt tuning.

Four keys cover every model in the admin's catalog. Add the ones you have to `.env` and restart
the API and worker (the admin picks them up on its next request):

| Provider | Key | Adapter | Models in the catalog |
|---|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `packages/core/src/providers/live/openai.ts` (images edits endpoint, synchronous) | gpt-image-2, gpt-image-2.5-sunburst, gpt-image-2.5-flare, gpt-image-1.5, gpt-image-1-mini |
| Google Gemini | `GEMINI_API_KEY` | `live/gemini.ts` (generateContent with image output, synchronous) | gemini-3.1-flash-image (Nano Banana 2), gemini-3-pro-image (Nano Banana Pro), gemini-3.1-flash-lite-image |
| Black Forest Labs | `BFL_API_KEY` (+ optional `BFL_WEBHOOK_SECRET`) | `live/bfl.ts` (submit, then poll or webhook) | flux-2-pro, flux-2-max, flux-2-flex, flux-kontext-pro, flux-kontext-max |
| fal.ai | `FAL_KEY` | `live/fal.ts` (queue API with signed webhooks) | Seedream 4.5, FLUX.2 Pro, Nano Banana 2, Kontext, Qwen Image Edit, Ideogram 3, Recraft V3 |

- **The catalog** (`packages/contracts/src/models.ts`) is what the design editor's Provider and
  Model dropdowns and the Models screen show: label, what each model is good for, how many
  reference images it takes, and an indicative price per image with the date it was checked against
  the provider's own pricing page (`PRICES_VERIFIED_ON`). Entries with `verifiedOn: null` were
  taken from catalog listings and show as "Approximate". Update prices there; nothing else needs to
  change. A slot can always use a model outside the catalog ("Custom model id").
- **Prices are indicative.** OpenAI and Google bill per output token, BFL per megapixel; the
  numbers are for the sizes this app uses. The design editor shows the resulting cost per customer
  (two previews, plus regenerations) so the merchant can pick models with the margin in mind. The
  provider's invoice is the source of truth.
- **Reference images.** Every adapter sends the customer photo first, then the design's scene and
  style images, so prompts can say "the person in the first image". Kontext models take one image;
  the others take up to the limit in the catalog.
- **Content filters.** A provider refusal (safety block) is reported as a refusal, not a failure,
  and the customer sees the "declined by the content filter" message rather than a generic error.
- **Not yet run against real accounts.** Every adapter is unit tested against the documented
  request and response shapes, but none has been exercised with a real key from this machine.
  First run with each key: put the provider in one slot of a draft design, use "Save and run
  test" with a sample photo, and check the Generations screen. Things to confirm on that first run:
  - fal: whether `image_urls` accepts a data URI (the fallback when storage has no public URL,
    see the comment in `fal.ts`); otherwise set `S3_PUBLIC_ENDPOINT` to something fal can reach.
  - Callback address: fal and BFL send results to `{WEBHOOK_PUBLIC_URL}/webhooks/ai/{provider}`
    (empty means `API_PUBLIC_URL`). `pnpm shopify:sync-env` sets it to the dev tunnel; in production
    set it to the app's https domain. If it is unreachable, results still arrive through the
    maintenance sweep, about 3 minutes later.
  - BFL: the exact `x-webhook-secret` header name if you set `BFL_WEBHOOK_SECRET` (without it the
    maintenance sweep polls the result instead, which also works).
  - OpenAI: `gpt-image-2` rejects `input_fidelity`; the adapter only sends it for 1.x models.
- **Model comparison:** `pnpm exec tsx scripts/compare-models.ts` runs each configured provider
  against the seeded sample photos and writes an HTML report to `reports/` (see that file's header).

## 3. Public hosting (or a tunnel for development)

**Unlocks:** receiving Shopify and provider webhooks.

- `shopify app dev` sets up a temporary tunnel automatically while developing — this is enough to
  receive real Shopify webhooks and exercise the app proxy against your dev store.
- For anything longer-lived, deploy `apps/api` and `apps/worker` somewhere reachable (they can be
  two processes talking to the same Postgres/Redis/S3-compatible storage — see
  `docker-compose.yml` for what each needs, then point `DATABASE_URL`/`REDIS_URL`/`S3_*` at real
  managed services instead).
- Set `API_PUBLIC_URL` to that public URL — it's what provider webhooks
  (`{API_PUBLIC_URL}/webhooks/ai/{provider}`) and the admin's presigned links are built from.
- **Storage note:** the browser never writes to storage (uploads go through the app proxy), so any
  S3-compatible store works, including Cloudflare R2: only `putObject`, `getObject` and presigned
  GET links (`presignDownload`) are used. Set `S3_PUBLIC_ENDPOINT` to the store's public https
  endpoint so presigned image links load on the storefront and in the embedded admin.
- Point `shopify.app.toml`'s `application_url` and `[app_proxy].url` at the same public host, and
  re-run `shopify app deploy` (or `shopify app dev` again for a tunnel) to push the config.

## 4. Client designs and reference artwork

**Unlocks:** real design templates and quality testing.

- Replace the two seeded designs (`packages/core/src/seed/index.ts`) with the client's actual
  designs, or add new ones from the admin's **New design** screen.
- Reference images (scene, style examples) and the example results shown on the product page are
  uploaded from the design editor (**Reference images** card). Files are stored privately under
  `shops/<shopId>/designs/<designId>/` and the design version keeps only their storage keys, so
  older versions keep pointing at their own images.
- Test each design with the client's own sample photos (a range of ages, skin tones, lighting,
  glasses, hair) before publishing, using **Save and run test** in the design editor.

## Local-only things this build simplified, worth knowing about

- **Rate limiting** keys on the client IP from `X-Forwarded-For`'s first entry — confirm this
  matches what Shopify's app proxy actually sends before trusting it in production (see the
  comment in `apps/api/src/lib/client-ip.ts`).
- **Face detection** (`requireSingleFace` in a design's upload rules) is a no-op — it always
  reports exactly one face. Wire a real detector into `setFaceCheck`
  (`packages/core/src/images/validate.ts`) before relying on that setting.
- **Delivery method** (digital download vs. a print partner) isn't decided — `orders.detail.tsx`'s
  "Download" button and "Mark delivered" are a placeholder for whichever you choose.
