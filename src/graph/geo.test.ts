import { haversineMeters } from './geo';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(48.85, 2.35, 48.85, 2.35)).toBe(0);
  });

  it('measures one degree of latitude as about 111.2 km', () => {
    expect(haversineMeters(0, 0, 1, 0)).toBeCloseTo(111_195, -1);
  });

  it('measures Paris to London as about 343.5 km', () => {
    expect(haversineMeters(48.8566, 2.3522, 51.5074, -0.1278) / 1000).toBeCloseTo(343.5, 0);
  });

  it('is symmetric', () => {
    expect(haversineMeters(10, 20, -30, 40)).toBe(haversineMeters(-30, 40, 10, 20));
  });
});
