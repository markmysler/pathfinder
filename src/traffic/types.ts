/** Where live traffic can come from, each with the user's own key. */
export type TrafficProvider = 'tomtom' | 'here';

/**
 * Traffic on one stretch of road, in the provider's own geometry. The points run the way the
 * traffic flows, so each direction of a two-way road is its own reading.
 */
export interface TrafficReading {
  /** [lon, lat] points, in the direction of travel. */
  line: (readonly [number, number])[];
  /** Current speed as a share of the speed when the road is clear: 1 is free-flowing. */
  ratio: number;
  closed: boolean;
}

/** Why traffic could not be fetched, in terms the user can act on. */
export type TrafficFailure = 'key' | 'quota' | 'unavailable';

export class TrafficError extends Error {
  constructor(
    readonly provider: TrafficProvider,
    readonly reason: TrafficFailure,
    detail: string,
  ) {
    super(detail);
    this.name = 'TrafficError';
  }
}
