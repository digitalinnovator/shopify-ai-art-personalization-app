import { config } from '../src/config';
import { closeDb } from '../src/db';
import { seed } from '../src/seed';

const domain = config('shopify').DEV_SHOP_DOMAIN;
const result = await seed(domain);
console.log(`  shop ${domain}`);
for (const d of result.designs) console.log(`  design ${d.slug}: ${d.created ? 'created' : 'exists'}`);
console.log(`  sample photos created: ${result.samplesCreated}`);
if (result.examplesAdded > 0)
  console.log(`  example images added to existing designs: ${result.examplesAdded}`);
await closeDb();
