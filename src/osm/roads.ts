/**
 * How OpenStreetMap tags translate into who may use a road, in which direction, and how fast.
 * The rules follow common OSM conventions; edge cases fall back to the cautious choice.
 */

export type TravelMode = 'car' | 'bike' | 'walk';
export type Tags = Readonly<Record<string, string | undefined>>;
export interface Directions {
  forward: boolean;
  backward: boolean;
}

const CAR_DEFAULT_KMH: Readonly<Record<string, number>> = {
  motorway: 110,
  motorway_link: 60,
  trunk: 90,
  trunk_link: 50,
  primary: 60,
  primary_link: 40,
  secondary: 50,
  secondary_link: 40,
  tertiary: 40,
  tertiary_link: 30,
  unclassified: 40,
  residential: 30,
  living_street: 10,
  service: 20,
  road: 30,
};

const carRoads = new Set(Object.keys(CAR_DEFAULT_KMH));
const withoutMotorways = [...carRoads].filter((h) => h !== 'motorway' && h !== 'motorway_link');

/** Roads each mode may use by default. */
const OPEN_TO: Record<TravelMode, ReadonlySet<string>> = {
  car: carRoads,
  bike: new Set([...withoutMotorways, 'cycleway', 'path', 'track']),
  walk: new Set([...withoutMotorways, 'footway', 'pedestrian', 'path', 'steps', 'track']),
};

/** Roads each mode may use only where a tag explicitly allows it. */
const OPEN_IF_TAGGED: Record<TravelMode, ReadonlySet<string>> = {
  car: new Set(),
  bike: new Set(['footway', 'pedestrian', 'bridleway']),
  walk: new Set(['cycleway', 'bridleway']),
};

/** Every `highway` value at least one mode can use, which is what to download. */
export const ROAD_TYPES: readonly string[] = [
  ...new Set(
    [...Object.values(OPEN_TO), ...Object.values(OPEN_IF_TAGGED)].flatMap((types) => [...types]),
  ),
].sort();

/** Access tags that apply to each mode, most specific first. */
const ACCESS_KEYS: Record<TravelMode, readonly string[]> = {
  car: ['motorcar', 'motor_vehicle', 'vehicle', 'access'],
  bike: ['bicycle', 'vehicle', 'access'],
  walk: ['foot', 'access'],
};

const GRANTED = new Set(['yes', 'designated', 'permissive', 'destination']);
const DENIED = new Set(['no', 'private']);
const BOTH = { forward: true, backward: true } as const;

/** Which directions `mode` may travel along a way, or null if it may not use the way at all. */
export function allowedDirections(tags: Tags, mode: TravelMode): Directions | null {
  const highway = tags.highway;
  if (highway === undefined || tags.area === 'yes') return null;

  const [modeKey] = ACCESS_KEYS[mode];
  if (OPEN_IF_TAGGED[mode].has(highway)) {
    if (!GRANTED.has(tags[modeKey!] ?? '')) return null;
  } else if (!OPEN_TO[mode].has(highway)) {
    return null;
  }
  const access = ACCESS_KEYS[mode].map((key) => tags[key]).find((value) => value !== undefined);
  if (access !== undefined && DENIED.has(access)) return null;

  if (mode === 'walk') return BOTH;
  return onewayDirections(tags, mode);
}

function onewayDirections(tags: Tags, mode: TravelMode): Directions {
  if (mode === 'bike' && bikesExemptFromOneway(tags)) return BOTH;
  switch (tags.oneway) {
    case 'yes':
    case 'true':
    case '1':
      return { forward: true, backward: false };
    case '-1':
    case 'reverse':
      return { forward: false, backward: true };
    case 'no':
    case 'false':
    case '0':
      return BOTH;
  }
  const impliedOneway =
    tags.junction === 'roundabout' || tags.junction === 'circular' || tags.highway === 'motorway';
  return impliedOneway ? { forward: true, backward: false } : BOTH;
}

function bikesExemptFromOneway(tags: Tags): boolean {
  if (tags['oneway:bicycle'] === 'no') return true;
  return ['cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both'].some((key) =>
    tags[key]?.startsWith('opposite'),
  );
}

const ZONE_KMH: Readonly<Record<string, number>> = {
  urban: 50,
  rural: 90,
  motorway: 130,
  living_street: 15,
};

/** Parses an OSM `maxspeed` value into km/h, or undefined when it gives no usable number. */
export function parseMaxspeed(value: string | undefined): number | undefined {
  const first = value?.split(';')[0]?.trim().toLowerCase();
  if (!first) return undefined;
  if (first === 'walk') return 6;

  const zone = /^[a-z]{2}:([a-z_]+)$/.exec(first);
  if (zone) return ZONE_KMH[zone[1]!];

  const number = /^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/.exec(first);
  if (!number) return undefined;
  const speed = Number(number[1]);
  if (speed <= 0) return undefined;
  return number[2] === 'mph' ? speed * 1.609344 : speed;
}

const BIKE_KMH = 15;
const BIKE_OFF_STREET_KMH = 10;
const bikeOffStreet = new Set(['footway', 'pedestrian', 'path', 'track', 'bridleway']);
const WALK_KMH = 5;
const WALK_STEPS_KMH = 2.5;

/** Typical travel speed along a way, in km/h. */
export function speedKmh(tags: Tags, mode: TravelMode): number {
  const highway = tags.highway ?? '';
  switch (mode) {
    case 'car':
      return parseMaxspeed(tags.maxspeed) ?? CAR_DEFAULT_KMH[highway] ?? 30;
    case 'bike':
      return bikeOffStreet.has(highway) ? BIKE_OFF_STREET_KMH : BIKE_KMH;
    case 'walk':
      return highway === 'steps' ? WALK_STEPS_KMH : WALK_KMH;
  }
}
