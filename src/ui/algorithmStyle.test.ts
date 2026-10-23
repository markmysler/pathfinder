import { algorithms } from '../algorithms';
import {
  algoColor,
  algorithmName,
  ALGORITHM_STYLE,
  formatWeight,
  sideColors,
} from './algorithmStyle';

describe('ALGORITHM_STYLE', () => {
  it('gives every algorithm a colour, a badge, a short name and a one-line description', () => {
    for (const id of Object.keys(algorithms)) {
      const style = ALGORITHM_STYLE[id as keyof typeof algorithms];
      expect(style.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(style.badge.length).toBeLessThanOrEqual(3);
      expect(style.blurb.length).toBeGreaterThan(10);
      expect(style.short.length).toBeLessThanOrEqual(11);
    }
  });

  it('uses a distinct colour for each algorithm', () => {
    const colors = Object.values(ALGORITHM_STYLE).map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('sideColors', () => {
  it('draws a one-way search in its colour', () => {
    expect(sideColors('dijkstra')).toEqual(['#2FC59A', '#2FC59A']);
  });

  it('draws the side from A in the one-way colour and the side from B in a lighter tint', () => {
    for (const [two, one] of [
      ['bibfs', 'bfs'],
      ['bidijkstra', 'dijkstra'],
      ['biastar', 'astar'],
    ] as const) {
      const [a, b] = sideColors(two);
      expect(a).toBe(ALGORITHM_STYLE[one].color);
      expect(b).toBe(ALGORITHM_STYLE[two].color);
      expect(lightness(b)).toBeGreaterThan(lightness(a));
    }
  });
});

describe('algoColor', () => {
  it('fills a one-way search with its colour, and a bidirectional one with both halves', () => {
    expect(algoColor('astar')).toEqual({
      '--algo': '#B197FC',
      '--algo-a': '#B197FC',
      '--algo-fill': '#B197FC',
    });
    expect(algoColor('biastar')).toEqual({
      '--algo': '#D4C6FD',
      '--algo-a': '#B197FC',
      '--algo-fill': 'linear-gradient(90deg, #B197FC 50%, #D4C6FD 50%)',
    });
  });
});

describe('algorithmName', () => {
  it('names an algorithm, adding the weight when A* weighs its estimate', () => {
    expect(algorithmName('dijkstra')).toBe('Dijkstra');
    expect(algorithmName('astar', 1)).toBe('A* search');
    expect(algorithmName('astar', 1.5)).toBe('A* search · 1.5×');
    expect(algorithmName('biastar')).toBe('Bidirectional A*');
    expect(formatWeight(2)).toBe('2×');
  });
});

function lightness(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return Math.max(n >> 16, (n >> 8) & 255, n & 255) + Math.min(n >> 16, (n >> 8) & 255, n & 255);
}
