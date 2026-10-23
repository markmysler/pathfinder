import { algorithms } from '../algorithms';
import { neighbours, TOPICS, topicBySlug } from './topics';

describe('TOPICS', () => {
  it('has an article for every algorithm, plus the foundations and guides', () => {
    for (const id of Object.keys(algorithms)) expect(topicBySlug(id)?.algorithm).toBe(id);
    expect(TOPICS.filter((t) => t.group === 'foundations')).toHaveLength(4);
    expect(TOPICS.filter((t) => t.group === 'guides')).toHaveLength(2);
    expect(new Set(TOPICS.map((t) => t.slug)).size).toBe(TOPICS.length);
  });

  it('reads as one sequence, foundations first', () => {
    expect(TOPICS[0]!.slug).toBe('graphs');
    expect(neighbours('graphs')).toEqual({ previous: null, next: topicBySlug('roads') });
    expect(neighbours('astar').previous?.slug).toBe('dijkstra');
    expect(neighbours('glossary').next).toBeNull();
  });

  it('knows its place within its group', () => {
    expect(topicBySlug('astar')).toMatchObject({ index: 5, of: 5 });
    expect(topicBySlug('graphs')).toMatchObject({ index: 1, of: 4 });
  });
});
