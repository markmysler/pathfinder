import {
  formatCost,
  formatCostsApart,
  formatCount,
  formatDistance,
  formatDuration,
  formatMs,
} from './format';

describe('formatDuration', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5.4)).toBe('0:05');
    expect(formatDuration(872)).toBe('14:32');
  });

  it('adds hours when needed', () => {
    expect(formatDuration(3_725)).toBe('1:02:05');
  });
});

describe('formatDistance', () => {
  it('uses meters below a kilometre and kilometres above', () => {
    expect(formatDistance(320.4)).toBe('320 m');
    expect(formatDistance(999.6)).toBe('1.0 km');
    expect(formatDistance(5_912)).toBe('5.9 km');
  });
});

describe('formatCost', () => {
  it('formats cost in the units of the objective', () => {
    expect(formatCost(872, 'fastest')).toBe('14:32');
    expect(formatCost(5_912, 'shortest')).toBe('5.9 km');
  });
});

describe('formatCostsApart', () => {
  it('formats costs as usual when they read differently', () => {
    expect(formatCostsApart([12.2, 15], 'fastest')).toEqual(['0:12', '0:15']);
    expect(formatCostsApart([12.2, 12.2], 'fastest')).toEqual(['0:12', '0:12']);
  });

  it('adds a decimal when different costs would read the same', () => {
    expect(formatCostsApart([12.2, 12.4], 'fastest')).toEqual(['0:12.2', '0:12.4']);
    expect(formatCostsApart([612.1, 612.4, 700], 'fastest')).toEqual([
      '10:12.1',
      '10:12.4',
      '11:40.0',
    ]);
    expect(formatCostsApart([320.2, 320.4], 'shortest')).toEqual(['320.2 m', '320.4 m']);
    expect(formatCostsApart([1_512, 1_534], 'shortest')).toEqual(['1.51 km', '1.53 km']);
    // Two decimals when one is not enough.
    expect(formatCostsApart([37.31, 37.34], 'fastest')).toEqual(['0:37.31', '0:37.34']);
    expect(formatCostsApart([320.21, 320.24], 'shortest')).toEqual(['320.21 m', '320.24 m']);
  });
});

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(48_210)).toBe('48,210');
    expect(formatCount(7)).toBe('7');
  });
});

describe('formatMs', () => {
  it('gives milliseconds, or seconds from one up', () => {
    expect(formatMs(33.6)).toBe('34 ms');
    expect(formatMs(228)).toBe('228 ms');
    expect(formatMs(1_480)).toBe('1.5 s');
    expect(formatMs(0.2)).toBe('<1 ms');
  });
});
