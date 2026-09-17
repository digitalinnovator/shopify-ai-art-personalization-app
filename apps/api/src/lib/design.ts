import type { DesignConfig } from '@aiart/contracts';
import type { Design, DesignVersion } from '@aiart/core/db';
import { getDesign, getVersion } from '@aiart/core/services';
import { notFound } from './errors';

export interface LiveDesign {
  design: Design;
  version: DesignVersion;
  config: DesignConfig;
}

/** Loads a design's live (published) version, or throws a 404 the same way for "missing" and "not live". */
export async function requireLiveDesign(shopId: string, designId: string): Promise<LiveDesign> {
  const design = await getDesign(shopId, designId);
  if (!design || design.status !== 'live' || !design.liveVersionId) {
    throw notFound('design_not_found', 'This design is not available');
  }
  const version = await getVersion(design.liveVersionId);
  if (!version) throw notFound('design_not_found', 'This design is not available');
  return { design, version, config: version.config as DesignConfig };
}
