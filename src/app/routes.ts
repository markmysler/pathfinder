import { algorithms, type AlgorithmId } from '../algorithms';

export type Location =
  { page: 'explore'; algorithms?: AlgorithmId[] } | { page: 'learn'; topic: string | null };

const isAlgorithm = (id: string): id is AlgorithmId => Object.hasOwn(algorithms, id);

/** Where a URL hash points: `#/learn/<topic>`, or Explore with `?algorithms=a,b` preselected. */
export function parseHash(hash: string): Location {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'learn') return { page: 'learn', topic: parts[1] ?? null };
  const chosen = (new URLSearchParams(query).get('algorithms') ?? '')
    .split(',')
    .filter(isAlgorithm);
  return chosen.length ? { page: 'explore', algorithms: chosen } : { page: 'explore' };
}

export const learnHref = (topic?: string) => (topic ? `#/learn/${topic}` : '#/learn');

export const exploreHref = (chosen: readonly AlgorithmId[]) => `#/?algorithms=${chosen.join(',')}`;
