import { covers } from './saved';
import type { BBox } from './area';
import type { OverpassResponse, RoadNetwork } from './network';
import { buildRoadNetwork } from './network';
import { SAMPLE_AREA } from './sampleRoute';

export { SAMPLE_AREA, SAMPLE_ROUTE } from './sampleRoute';

let network: Promise<RoadNetwork> | undefined;

/** The bundled streets, built once and only when a route asks for them. */
function sampleNetwork(): Promise<RoadNetwork> {
  network ??= import('./fixtures/plaza-de-mayo.overpass.json').then((module) =>
    buildRoadNetwork(module.default as unknown as OverpassResponse),
  );
  return network;
}

/** The bundled streets, if the box just around A and B fits inside them. */
export async function sampleStreetsFor(
  ends: BBox,
): Promise<{ network: RoadNetwork; box: BBox } | undefined> {
  if (!covers(SAMPLE_AREA, ends)) return undefined;
  return { network: await sampleNetwork(), box: SAMPLE_AREA };
}
