import { allowedDirections, parseMaxspeed, speedKmh, type Tags, type TravelMode } from './roads';

const both = { forward: true, backward: true };
const forwardOnly = { forward: true, backward: false };
const backwardOnly = { forward: false, backward: true };
const allowed = (tags: Tags, mode: TravelMode) => allowedDirections(tags, mode);

describe('allowedDirections', () => {
  describe('for every mode', () => {
    it.each(['car', 'bike', 'walk'] as const)(
      'ignores ways that are not usable roads (%s)',
      (mode) => {
        expect(allowed({ building: 'yes' }, mode)).toBeNull();
        expect(allowed({ highway: 'construction' }, mode)).toBeNull();
        expect(allowed({ highway: 'proposed' }, mode)).toBeNull();
        expect(allowed({ highway: 'pedestrian', area: 'yes' }, mode)).toBeNull();
        expect(allowed({ highway: 'residential', access: 'private' }, mode)).toBeNull();
      },
    );
  });

  describe('car', () => {
    it('drives both ways on ordinary streets', () => {
      expect(allowed({ highway: 'residential' }, 'car')).toEqual(both);
      expect(allowed({ highway: 'primary' }, 'car')).toEqual(both);
    });

    it('stays off paths meant for people and bikes', () => {
      for (const highway of ['footway', 'cycleway', 'path', 'steps', 'pedestrian', 'track']) {
        expect(allowed({ highway }, 'car')).toBeNull();
      }
    });

    it('follows one-way streets', () => {
      for (const oneway of ['yes', 'true', '1']) {
        expect(allowed({ highway: 'residential', oneway }, 'car')).toEqual(forwardOnly);
      }
      expect(allowed({ highway: 'residential', oneway: '-1' }, 'car')).toEqual(backwardOnly);
    });

    it('treats roundabouts and motorways as one-way unless tagged otherwise', () => {
      expect(allowed({ highway: 'primary', junction: 'roundabout' }, 'car')).toEqual(forwardOnly);
      expect(allowed({ highway: 'motorway' }, 'car')).toEqual(forwardOnly);
      expect(allowed({ highway: 'motorway', oneway: 'no' }, 'car')).toEqual(both);
    });

    it('respects vehicle access tags', () => {
      expect(allowed({ highway: 'service', access: 'no', motor_vehicle: 'yes' }, 'car')).toEqual(
        both,
      );
      expect(allowed({ highway: 'residential', motor_vehicle: 'no' }, 'car')).toBeNull();
      expect(allowed({ highway: 'residential', motorcar: 'no' }, 'car')).toBeNull();
    });
  });

  describe('bike', () => {
    it('rides on streets and cycleways but not motorways', () => {
      expect(allowed({ highway: 'residential' }, 'bike')).toEqual(both);
      expect(allowed({ highway: 'cycleway' }, 'bike')).toEqual(both);
      expect(allowed({ highway: 'motorway' }, 'bike')).toBeNull();
    });

    it('uses footways only where bikes are explicitly allowed', () => {
      expect(allowed({ highway: 'footway' }, 'bike')).toBeNull();
      expect(allowed({ highway: 'footway', bicycle: 'yes' }, 'bike')).toEqual(both);
      expect(allowed({ highway: 'footway', bicycle: 'designated' }, 'bike')).toEqual(both);
      expect(allowed({ highway: 'residential', bicycle: 'no' }, 'bike')).toBeNull();
    });

    it('follows one-way streets unless bikes are exempt', () => {
      expect(allowed({ highway: 'residential', oneway: 'yes' }, 'bike')).toEqual(forwardOnly);
      expect(
        allowed({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no' }, 'bike'),
      ).toEqual(both);
      expect(
        allowed({ highway: 'residential', oneway: 'yes', cycleway: 'opposite_lane' }, 'bike'),
      ).toEqual(both);
    });
  });

  describe('walk', () => {
    it('walks on streets, footways, steps and pedestrian zones', () => {
      for (const highway of ['residential', 'footway', 'steps', 'pedestrian', 'path', 'primary']) {
        expect(allowed({ highway }, 'walk')).toEqual(both);
      }
    });

    it('ignores one-way restrictions', () => {
      expect(allowed({ highway: 'residential', oneway: 'yes' }, 'walk')).toEqual(both);
      expect(allowed({ highway: 'primary', junction: 'roundabout' }, 'walk')).toEqual(both);
    });

    it('stays off motorways, cycleways and roads closed to pedestrians', () => {
      expect(allowed({ highway: 'motorway' }, 'walk')).toBeNull();
      expect(allowed({ highway: 'cycleway' }, 'walk')).toBeNull();
      expect(allowed({ highway: 'cycleway', foot: 'yes' }, 'walk')).toEqual(both);
      expect(allowed({ highway: 'residential', foot: 'no' }, 'walk')).toBeNull();
      expect(allowed({ highway: 'service', access: 'no', foot: 'yes' }, 'walk')).toEqual(both);
    });
  });
});

describe('parseMaxspeed', () => {
  it('reads plain km/h values', () => {
    expect(parseMaxspeed('50')).toBe(50);
    expect(parseMaxspeed(' 60 ')).toBe(60);
    expect(parseMaxspeed('40;30')).toBe(40);
  });

  it('converts mph', () => {
    expect(parseMaxspeed('30 mph')).toBeCloseTo(48.28, 2);
  });

  it('understands zone codes and walking pace', () => {
    expect(parseMaxspeed('AR:urban')).toBe(50);
    expect(parseMaxspeed('DE:rural')).toBe(90);
    expect(parseMaxspeed('FR:motorway')).toBe(130);
    expect(parseMaxspeed('NL:living_street')).toBe(15);
    expect(parseMaxspeed('walk')).toBe(6);
  });

  it('returns undefined when there is no usable limit', () => {
    for (const value of [undefined, '', 'none', 'signals', 'variable', 'fast', '0', '-20']) {
      expect(parseMaxspeed(value)).toBeUndefined();
    }
  });
});

describe('speedKmh', () => {
  it('drives at the posted limit when there is one', () => {
    expect(speedKmh({ highway: 'primary', maxspeed: '70' }, 'car')).toBe(70);
  });

  it('falls back to a typical limit for the road type', () => {
    expect(speedKmh({ highway: 'residential' }, 'car')).toBe(30);
    expect(speedKmh({ highway: 'primary' }, 'car')).toBe(60);
    expect(speedKmh({ highway: 'motorway', maxspeed: 'none' }, 'car')).toBe(110);
    expect(speedKmh({ highway: 'living_street' }, 'car')).toBe(10);
  });

  it('rides at an average cycling pace, slower off-street', () => {
    expect(speedKmh({ highway: 'residential' }, 'bike')).toBe(15);
    expect(speedKmh({ highway: 'cycleway' }, 'bike')).toBe(15);
    expect(speedKmh({ highway: 'footway', bicycle: 'yes' }, 'bike')).toBe(10);
  });

  it('walks at an average pace, slower on steps', () => {
    expect(speedKmh({ highway: 'residential' }, 'walk')).toBe(5);
    expect(speedKmh({ highway: 'steps' }, 'walk')).toBe(2.5);
  });

  it('never goes faster on a bike or on foot because of a speed limit', () => {
    expect(speedKmh({ highway: 'primary', maxspeed: '80' }, 'bike')).toBe(15);
    expect(speedKmh({ highway: 'primary', maxspeed: '80' }, 'walk')).toBe(5);
  });
});
