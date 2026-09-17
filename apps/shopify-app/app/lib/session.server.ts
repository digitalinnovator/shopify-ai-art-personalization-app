import { config } from '@aiart/core/config';
import { createCookieSessionStorage } from 'react-router';

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: 'aiart_admin_session',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secrets: [config('admin').ADMIN_SESSION_SECRET],
    secure: config('app').NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
});

export function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get('Cookie'));
}
