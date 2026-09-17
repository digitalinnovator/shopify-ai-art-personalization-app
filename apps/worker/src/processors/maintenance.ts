import { logger } from '@aiart/core/logger';
import { recoverStalledWork, sweepRetention } from '@aiart/core/services';

const log = logger('worker:maintenance');

export async function processMaintenance(): Promise<void> {
  const recovered = await recoverStalledWork();
  const retention = await sweepRetention();
  if (recovered.previews || recovered.finalize || recovered.orders || retention.deleted) {
    log.info({ ...recovered, deleted: retention.deleted }, 'maintenance sweep');
  }
}
