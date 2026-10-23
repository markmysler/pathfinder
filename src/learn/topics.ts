import type { AlgorithmId } from '../algorithms';

export type TopicGroup = 'foundations' | 'algorithms' | 'guides';

export interface Topic {
  slug: string;
  title: string;
  group: TopicGroup;
  /** One line for cards and lists. */
  summary: string;
  algorithm?: AlgorithmId;
  /** Position within its group, from 1. */
  index: number;
  of: number;
}

type TopicInfo = Omit<Topic, 'index' | 'of'>;

const LIST: TopicInfo[] = [
  {
    slug: 'graphs',
    title: 'What is a graph?',
    group: 'foundations',
    summary: 'Points, and the lines between them. Everything else builds on this.',
  },
  {
    slug: 'roads',
    title: 'Roads as a graph',
    group: 'foundations',
    summary: 'How intersections become nodes and streets become edges with a cost.',
  },
  {
    slug: 'frontier',
    title: 'Frontier, expanded and cost',
    group: 'foundations',
    summary: 'The three words every search on this site uses.',
  },
  {
    slug: 'heuristics',
    title: 'Heuristics',
    group: 'foundations',
    summary: 'Educated guesses about distance, and when a guess is safe.',
  },
  {
    slug: 'bfs',
    title: 'Breadth-first search',
    group: 'algorithms',
    algorithm: 'bfs',
    summary: 'Level by level, fewest turns',
  },
  {
    slug: 'dfs',
    title: 'Depth-first search',
    group: 'algorithms',
    algorithm: 'dfs',
    summary: 'Deep first, then backtrack',
  },
  {
    slug: 'greedy',
    title: 'Greedy best-first',
    group: 'algorithms',
    algorithm: 'greedy',
    summary: 'Rushes at whatever looks closest',
  },
  {
    slug: 'dijkstra',
    title: 'Dijkstra',
    group: 'algorithms',
    algorithm: 'dijkstra',
    summary: 'Ripples out by cost, always optimal',
  },
  {
    slug: 'astar',
    title: 'A* search',
    group: 'algorithms',
    algorithm: 'astar',
    summary: 'Dijkstra with a sense of direction',
  },
  {
    slug: 'which',
    title: 'Which algorithm when?',
    group: 'guides',
    summary: 'What each one is good for, side by side.',
  },
  {
    slug: 'glossary',
    title: 'Glossary',
    group: 'guides',
    summary: 'Every term used on this site, in a sentence or two.',
  },
];

export const TOPICS: Topic[] = LIST.map((topic) => {
  const group = LIST.filter((t) => t.group === topic.group);
  return { ...topic, index: group.indexOf(topic) + 1, of: group.length };
});

/** Topics still to be written, shown as "Soon". */
export const COMING_LATER = [
  'Bidirectional search',
  'Bellman-Ford',
  'ALT (landmarks)',
  'Contraction hierarchies',
];

export const GROUP_TITLE: Record<TopicGroup, string> = {
  foundations: 'Foundations',
  algorithms: 'Algorithms',
  guides: 'Guides',
};

export const topicBySlug = (slug: string) => TOPICS.find((t) => t.slug === slug);

export function neighbours(slug: string) {
  const i = TOPICS.findIndex((t) => t.slug === slug);
  return { previous: TOPICS[i - 1] ?? null, next: TOPICS[i + 1] ?? null };
}
