import { index, layout, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  // Local mock sign-in (AUTH_MODE=mock) …
  route('login', 'routes/login.tsx'),
  route('logout', 'routes/logout.tsx'),
  // … and Shopify's own auth round-trips (AUTH_MODE=shopify).
  route('auth/login', 'routes/auth.login.tsx'),
  route('auth/*', 'routes/auth.$.tsx'),
  layout('routes/app-layout.tsx', [
    index('routes/home.tsx'),
    route('designs', 'routes/designs.index.tsx'),
    route('designs/new', 'routes/designs.new.tsx'),
    route('designs/:designId', 'routes/designs.detail.tsx'),
    route('generations', 'routes/generations.index.tsx'),
    route('generations/:jobId', 'routes/generations.detail.tsx'),
    route('orders', 'routes/orders.index.tsx'),
    route('orders/:orderId', 'routes/orders.detail.tsx'),
    route('orders/:orderId/download/:lineItemId', 'routes/orders.download.tsx'),
    route('models', 'routes/models.index.tsx'),
    route('privacy', 'routes/privacy.index.tsx'),
    route('settings', 'routes/settings.index.tsx'),
  ]),
] satisfies RouteConfig;
