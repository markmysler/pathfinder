import { algorithms } from '../algorithms';
import { algorithmName, ALGORITHM_STYLE, formatWeight } from './algorithmStyle';

describe('ALGORITHM_STYLE', () => {
  it('gives every algorithm a colour, a badge, a short name and a one-line description', () => {
    for (const id of Object.keys(algorithms)) {
      const style = ALGORITHM_STYLE[id as keyof typeof algorithms];
      expect(style.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(style.badge.length).toBeLessThanOrEqual(3);
      expect(style.blurb.length).toBeGreaterThan(10);
      expect(style.short.length).toBeLessThanOrEqual(8);
    }
  });

  it('uses a distinct colour for each algorithm', () => {
    const colors = Object.values(ALGORITHM_STYLE).map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('algorithmName', () => {
  it('names an algorithm, adding the weight when A* weighs its estimate', () => {
    expect(algorithmName('dijkstra')).toBe('Dijkstra');
    expect(algorithmName('astar', 1)).toBe('A* search');
    expect(algorithmName('astar', 1.5)).toBe('A* search · 1.5×');
    expect(formatWeight(2)).toBe('2×');
  });
});
