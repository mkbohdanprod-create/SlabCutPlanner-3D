/**
 * Набір креслень цеху — один виклик: збірка, деталі, мийка, стики, специфікація.
 * Див. `set.ts` (перелік аркушів і правила) та `sheetsExtra.ts`.
 */
import { composeDrawingSet, type DrawingSetResult, type SetInput } from './set';
import { composeJointsSheet, composeSinkSheet, composeSpecSheet } from './sheetsExtra';
import { composeShopExplodedSheet, composeSinkExplodedSheet, composeSiteExplodedSheet } from './exploded';

export function composeFullDrawingSet(input: SetInput): DrawingSetResult {
  return composeDrawingSet(input, { sink: composeSinkSheet, joints: composeJointsSheet, explodedShop: composeShopExplodedSheet, explodedSink: composeSinkExplodedSheet, explodedSite: composeSiteExplodedSheet, spec: composeSpecSheet });
}

export type { SetInput, DrawingSetResult } from './set';
export { DrawingSvg } from './render';
