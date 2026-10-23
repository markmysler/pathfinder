import { lazy, Suspense } from 'react';
import { ExplorePage } from '../explore/ExplorePage';
import { useHashRoute } from './hooks';
import { ServicesProvider, type Services } from './services';

// Articles, diagrams and their recorded streets load only when Learn is opened.
const LearnPage = lazy(() =>
  import('../learn/LearnPage').then((module) => ({ default: module.LearnPage })),
);

export function App({ services }: { services: Services }) {
  const route = useHashRoute();
  return (
    <ServicesProvider value={services}>
      {route === 'learn' ? (
        <Suspense fallback={null}>
          <LearnPage />
        </Suspense>
      ) : (
        <ExplorePage />
      )}
    </ServicesProvider>
  );
}
