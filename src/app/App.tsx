import { lazy, Suspense } from 'react';
import { useHashRoute } from './hooks';
import { ServicesProvider, type Services } from './services';

// Each page loads its own code: Learn its articles, diagrams and recorded streets; Explore its
// panels and playback, and later the map.
const ExplorePage = lazy(() =>
  import('../explore/ExplorePage').then((module) => ({ default: module.ExplorePage })),
);
const LearnPage = lazy(() =>
  import('../learn/LearnPage').then((module) => ({ default: module.LearnPage })),
);

export function App({ services }: { services: Services }) {
  const route = useHashRoute();
  return (
    <ServicesProvider value={services}>
      <Suspense fallback={null}>{route === 'learn' ? <LearnPage /> : <ExplorePage />}</Suspense>
    </ServicesProvider>
  );
}
