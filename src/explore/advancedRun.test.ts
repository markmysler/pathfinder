import { algorithms } from '../algorithms';
import { bellmanFordRounds } from '../playback/rounds';
import { hopsVsCost } from '../test/fixtures';
import { solve } from '../test/timelines';
import { roundJump } from './advancedRun';

describe('roundJump', () => {
  // Rounds start at steps 1, 2, 4 and 5 of 5.
  const { timeline } = solve({ graph: hopsVsCost(), source: 0, target: 3 }, algorithms.bellmanford);
  const rounds = bellmanFordRounds(timeline, 3);

  it('goes forward to where the next round starts, or to the end', () => {
    expect(roundJump(rounds, 2, 1, timeline.steps)).toBe(4);
    expect(roundJump(rounds, 0, 1, timeline.steps)).toBe(1);
    expect(roundJump(rounds, 5, 1, timeline.steps)).toBe(5);
  });

  it('goes back to where this round started, or the one before if already there', () => {
    expect(roundJump(rounds, 3, -1, timeline.steps)).toBe(2);
    expect(roundJump(rounds, 2, -1, timeline.steps)).toBe(1);
    expect(roundJump(rounds, 1, -1, timeline.steps)).toBe(0);
  });
});
