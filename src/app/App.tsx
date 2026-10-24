import { lazy, Suspense, useState } from 'react';
import { BackOnlineNote } from './Connection';
import { useHashRoute, useOnline } from './hooks';
import { RunOpenContext, useServiceWorkerUpdate } from './pwa';
import { ServicesProvider, type Services } from './services';
import { UpdatePrompt } from './UpdatePrompt';

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
  const update = useServiceWorkerUpdate();
  const [runOpen, setRunOpen] = useState(false);
  const online = useOnline();
  return (
    <ServicesProvider value={services}>
      <RunOpenContext.Provider value={setRunOpen}>
        <Suspense fallback={null}>{route === 'learn' ? <LearnPage /> : <ExplorePage />}</Suspense>
      </RunOpenContext.Provider>
      <UpdatePrompt ready={update.ready} holding={runOpen} onReload={update.reload} />
      <BackOnlineNote online={online} />
    </ServicesProvider>
  );
}
