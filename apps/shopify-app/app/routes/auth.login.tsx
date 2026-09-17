import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { TextField } from '../components/fields';

/**
 * Shown only when someone opens the app URL directly instead of from the Shopify admin: asks for
 * the store domain and starts the install/login flow. `shopify.login` does the redirecting; it
 * returns an error object when the domain is missing or malformed.
 */
async function runLogin(request: Request): Promise<{ shop?: string }> {
  const { login } = await import('../shopify.server');
  const result = await login(request);
  const shopError = (result as { shop?: unknown }).shop;
  return { shop: shopError ? 'Enter your store domain, for example my-store.myshopify.com' : undefined };
}

export async function loader({ request }: LoaderFunctionArgs) {
  return { errors: await runLogin(request) };
}

export async function action({ request }: ActionFunctionArgs) {
  return { errors: await runLogin(request) };
}

export default function AuthLogin() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors ?? loaderData.errors;
  const navigation = useNavigation();
  return (
    <AuthLayout
      title="Log in to AI Art Preview"
      footer="You will be redirected to Shopify to approve the app."
    >
      <Form method="post" className="stack">
        <TextField
          label="Store domain"
          name="shop"
          placeholder="my-store.myshopify.com"
          autoComplete="on"
          error={errors.shop}
          required
        />
        <Button type="submit" variant="primary" block loading={navigation.state !== 'idle'}>
          Log in
        </Button>
      </Form>
    </AuthLayout>
  );
}
