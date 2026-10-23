import { algorithms } from '../algorithms';
import { COMING_LATER, neighbours, TOPICS, topicBySlug, topicFor } from './topics';

describe('TOPICS', () => {
  it('has an article for every algorithm, plus the foundations and guides', () => {
    for (const info of Object.values(algorithms)) {
      if (!info.bidirectional) expect(topicBySlug(info.id)?.algorithm).toBe(info.id);
    }
    // One article covers every search from both ends.
    for (const id of ['bibfs', 'bidijkstra', 'biastar'] as const) {
      expect(topicFor(id)?.slug).toBe('bidirectional');
    }
    expect(topicFor('dfs')?.slug).toBe('dfs');
    expect(COMING_LATER).not.toContain('Bidirectional search');
    expect(TOPICS.filter((t) => t.group === 'foundations')).toHaveLength(4);
    expect(TOPICS.filter((t) => t.group === 'guides')).toHaveLength(2);
    expect(new Set(TOPICS.map((t) => t.slug)).size).toBe(TOPICS.length);
  });

  it('reads as one sequence, foundations first', () => {
    expect(TOPICS[0]!.slug).toBe('graphs');
    expect(neighbours('graphs')).toEqual({ previous: null, next: topicBySlug('roads') });
    expect(neighbours('astar').previous?.slug).toBe('dijkstra');
    expect(neighbours('bidirectional')).toMatchObject({
      previous: { slug: 'astar' },
      next: { slug: 'which' },
    });
    expect(neighbours('glossary').next).toBeNull();
  });

  it('knows its place within its group', () => {
    expect(topicBySlug('astar')).toMatchObject({ index: 5, of: 6 });
    expect(topicBySlug('bidirectional')).toMatchObject({ index: 6, of: 6 });
    expect(topicBySlug('graphs')).toMatchObject({ index: 1, of: 4 });
  });
});
