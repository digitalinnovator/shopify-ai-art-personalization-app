import type { ReactNode } from 'react';
import {
  isRouteErrorResponse,
  Links,
  type LinksFunction,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import type { Route } from './+types/root';
import { Icon } from './components/Icon';
import appStylesHref from './styles/app.css?url';

// Polaris React is deprecated and its web-component successor needs React 19 to wire events, so
// the admin ships its own small, Polaris-styled design system (app/styles, app/components). It
// looks native inside the Shopify admin and identical when run locally. Inter is loaded from
// Google Fonts with a system fallback; Shopify's embedded-app headers only restrict
// frame-ancestors, so the font loads inside the admin iframe too.
export const links: LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  { rel: 'stylesheet', href: appStylesHref },
  {
    rel: 'icon',
    href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234b2fd6'/%3E%3Cpath d='M16 7l2.2 6.8L25 16l-6.8 2.2L16 25l-2.2-6.8L7 16l6.8-2.2z' fill='%23fff'/%3E%3C/svg%3E",
  },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>AI Art Preview</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const title = notFound ? 'Page not found' : 'Something went wrong';
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}${typeof error.data === 'string' && error.data ? `: ${error.data}` : ''}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  return (
    <div className="error-page">
      <div className="error-page__card">
        <div className="error-page__icon">
          <Icon name={notFound ? 'search' : 'alert-triangle'} size={24} />
        </div>
        <div>
          <h1 className="page-header__title">{title}</h1>
          <p className="page-header__subtitle">
            {notFound
              ? 'The page you opened does not exist or has been removed.'
              : 'The request could not be completed. You can try again, or go back to the dashboard.'}
          </p>
        </div>
        {!notFound ? <pre className="error-page__detail text-sm">{detail}</pre> : null}
        <div className="row">
          <a href="/" className="btn btn--primary">
            Go to dashboard
          </a>
          {!notFound ? (
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
