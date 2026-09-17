import { config } from '@aiart/core/config';
import { seed } from '@aiart/core/seed';
import { ensureShop } from '@aiart/core/services';
import type { ActionFunctionArgs } from 'react-router';
import { Form, redirect, useLoaderData, useNavigation } from 'react-router';
import { AuthLayout } from '../components/AuthLayout';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { sessionStorage } from '../lib/session.server';

export async function loader() {
  if (config('admin').AUTH_MODE !== 'mock') throw redirect('/');
  return { shopDomain: config('shopify').DEV_SHOP_DOMAIN };
}

export async function action({ request: _request }: ActionFunctionArgs) {
  const domain = config('shopify').DEV_SHOP_DOMAIN;
  await ensureShop(domain);
  await seed(domain); // idempotent: makes sure the sample designs exist for a fresh database
  const session = await sessionStorage.getSession();
  session.set('shopDomain', domain);
  return redirect('/', { headers: { 'Set-Cookie': await sessionStorage.commitSession(session) } });
}

export default function Login() {
  const { shopDomain } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  return (
    <AuthLayout
      title="Sign in to AI Art Preview"
      footer="Local development only. Real installations sign in through Shopify."
    >
      <Banner tone="info">
        This is the local sign-in used while developing. It opens the admin for your development store without
        a password.
      </Banner>
      <Form method="post">
        <Button
          type="submit"
          variant="primary"
          block
          loading={navigation.state !== 'idle'}
          icon="shopping-bag"
        >
          Continue as {shopDomain}
        </Button>
      </Form>
    </AuthLayout>
  );
}
