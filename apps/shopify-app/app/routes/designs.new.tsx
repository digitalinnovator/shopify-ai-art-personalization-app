import { DesignConfigSchema } from '@aiart/contracts';
import { createDesign } from '@aiart/core/services';
import { useRef, useState } from 'react';
import type { ActionFunctionArgs } from 'react-router';
import { data, Form, redirect, useActionData, useNavigation } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { Card } from '../components/Card';
import { RadioCards, TextArea, TextField } from '../components/fields';
import { ActionBar, Page } from '../components/Page';
import { requireShop } from '../lib/auth.server';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();
  const slug = slugify(String(form.get('slug') ?? ''));
  const type = form.get('type') === 'face_into_scene' ? 'face_into_scene' : 'style_transfer';
  const prompt = String(form.get('prompt') ?? '').trim();

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Give the design a name.';
  if (!slug) errors.slug = 'The slug needs at least one letter or number.';
  if (prompt.length < 10) errors.prompt = 'Write at least 10 characters of instructions for the model.';
  if (Object.keys(errors).length > 0) return data({ errors }, { status: 400 });

  const parsed = DesignConfigSchema.safeParse({
    prompt,
    slots: [
      { slot: 'A', provider: 'mock', model: 'mock-illustrate' },
      { slot: 'B', provider: 'mock', model: 'mock-painterly' },
    ],
  });
  if (!parsed.success) {
    errors.prompt = parsed.error.issues[0]?.message ?? 'Invalid design.';
    return data({ errors }, { status: 400 });
  }

  const { designId } = await createDesign({
    shopId: shop.id,
    slug,
    name,
    type,
    shopifyProductIds: [],
    config: parsed.data,
  });
  return redirect(`/designs/${designId}?toast=created`);
}

export default function NewDesign() {
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors ?? {};
  const navigation = useNavigation();
  const slugRef = useRef<HTMLInputElement>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <Page
      narrow
      backTo="/designs"
      backLabel="Designs"
      title="New design"
      subtitle="Starts as a draft with two mock preview slots. You can change everything on the next screen."
    >
      <Form method="post" id="new-design-form">
        <Card>
          <div className="stack">
            <TextField
              label="Name"
              name="name"
              required
              autoComplete="off"
              placeholder="Storybook Knight Portrait"
              error={errors.name}
              onChange={(e) => {
                if (!slugTouched && slugRef.current) slugRef.current.value = slugify(e.target.value);
              }}
            />
            <TextField
              label="Slug"
              name="slug"
              required
              ref={slugRef}
              help="Used internally and in file paths. Letters, numbers and dashes."
              error={errors.slug}
              onChange={() => setSlugTouched(true)}
            />
            <RadioCards
              legend="Design type"
              name="type"
              defaultValue="face_into_scene"
              options={[
                {
                  value: 'face_into_scene',
                  label: 'Face into scene',
                  description: 'Place the customer in an illustrated scene, keeping their likeness.',
                  icon: 'scan-face',
                },
                {
                  value: 'style_transfer',
                  label: 'Style transfer',
                  description: 'Repaint the customer photo in an art style.',
                  icon: 'wand',
                },
              ]}
            />
            <TextArea
              label="Prompt"
              name="prompt"
              rows={5}
              required
              placeholder="Place the person from the customer photo as the knight in the scene image. Keep their facial features, skin tone and hairstyle."
              help="The instructions sent to the model. You can refine it, add reference images and pick models on the next screen."
              error={errors.prompt}
            />
          </div>
        </Card>
        <ActionBar>
          <ButtonLink to="/designs" variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" variant="primary" loading={navigation.state !== 'idle'}>
            Create draft
          </Button>
        </ActionBar>
      </Form>
    </Page>
  );
}
