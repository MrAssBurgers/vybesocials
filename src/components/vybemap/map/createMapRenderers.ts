import { lazy } from 'react';

const load3d = () => import('./VybeMapboxCanvas').then(m => ({ default: m.VybeMapboxCanvas }));
const loadFlat = () => import('./VybeMapLeafletFallback').then(m => ({ default: m.VybeMapLeafletFallback }));

/** Each mounted map gets fresh lazy state, so Retry can retire a failed load. */
export function createMapRenderers(mapbox = load3d, flat = loadFlat) {
  return { VybeMapboxCanvas: lazy(mapbox), VybeMapLeafletFallback: lazy(flat) };
}
