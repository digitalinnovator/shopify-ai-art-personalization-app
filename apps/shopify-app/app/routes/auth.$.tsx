import type { LoaderFunctionArgs } from 'react-router';

/**
 * Catch-all for Shopify's auth round-trips (`/auth/callback`, `/auth/session-token`, …).
 * `authenticate.admin` handles every case itself — it throws the redirect it needs.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { authenticate } = await import('../shopify.server');
  await authenticate.admin(request);
  return null;
}
