import {
  DEFAULT_SHOP_SETTINGS,
  type ShopSettings,
  type ShopSettingsInput,
  ShopSettingsSchema,
} from '@aiart/contracts';
import { eq } from 'drizzle-orm';
import { db, type Shop, shops } from '../db';

export async function ensureShop(domain: string): Promise<Shop> {
  await db()
    .insert(shops)
    .values({ domain, settings: DEFAULT_SHOP_SETTINGS })
    .onConflictDoNothing({ target: shops.domain });
  const [shop] = await db().select().from(shops).where(eq(shops.domain, domain));
  if (!shop) throw new Error(`Could not create or find shop ${domain}`);
  return shop;
}

export async function getShopByDomain(domain: string): Promise<Shop | undefined> {
  const [shop] = await db().select().from(shops).where(eq(shops.domain, domain));
  return shop;
}

export async function getShop(shopId: string): Promise<Shop | undefined> {
  const [shop] = await db().select().from(shops).where(eq(shops.id, shopId));
  return shop;
}

export async function updateShopSettings(
  shopId: string,
  patch: Partial<ShopSettingsInput>,
): Promise<ShopSettings> {
  const shop = await getShop(shopId);
  if (!shop) throw new Error(`Shop ${shopId} not found`);
  const merged = ShopSettingsSchema.parse({ ...shop.settings, ...patch });
  await db().update(shops).set({ settings: merged }).where(eq(shops.id, shopId));
  return merged;
}
