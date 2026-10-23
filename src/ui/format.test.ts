import { formatCost, formatCount, formatDistance, formatDuration } from './format';

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

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(48_210)).toBe('48,210');
    expect(formatCount(7)).toBe('7');
  });
});
