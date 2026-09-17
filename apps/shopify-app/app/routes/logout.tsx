import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { getSession, sessionStorage } from '../lib/session.server';

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request);
  return redirect('/login', { headers: { 'Set-Cookie': await sessionStorage.destroySession(session) } });
}

export async function loader() {
  return redirect('/login');
}
