import { AppProvider } from '@shopify/shopify-app-react-router/react';
import { boundary } from '@shopify/shopify-app-react-router/server';
import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { isRouteErrorResponse, Link, Outlet, useLoaderData, useRouteError } from 'react-router';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { ToastProvider } from '../components/Toast';
import { requireShop } from '../lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop, embedded } = await requireShop(request);
  return { shopDomain: shop.domain, embedded, apiKey: process.env.SHOPIFY_API_KEY ?? '' };
}

// Shopify's package needs to add/forward a few headers on embedded responses (and on errors).
export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  const error = useRouteError();
  // Our own 404s (a design or order that does not exist) get a friendly page; everything else is
  // handed to Shopify's boundary, which handles re-authentication redirects for embedded apps.
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="error-page">
        <div className="error-page__card">
          <div className="error-page__icon">
            <Icon name="search" size={24} />
          </div>
          <div>
            <h1 className="page-header__title">Not found</h1>
            <p className="page-header__subtitle">
              {typeof error.data === 'string' && error.data
                ? error.data
                : 'This item does not exist or has been removed.'}
            </p>
          </div>
          <div className="row">
            <Link to="/" className="btn btn--primary">
              Go to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return boundary.error(error);
}

export default function AppLayout() {
  const { shopDomain, embedded, apiKey } = useLoaderData<typeof loader>();
  const shell = (
    <ToastProvider>
      <AppShell shopDomain={shopDomain} embedded={embedded}>
        <Outlet />
      </AppShell>
    </ToastProvider>
  );
  // Inside the Shopify admin, AppProvider loads App Bridge (which is what makes the iframe
  // session token flow work). Locally there is no admin frame, so it is skipped.
  return embedded ? <AppProvider apiKey={apiKey}>{shell}</AppProvider> : shell;
}
