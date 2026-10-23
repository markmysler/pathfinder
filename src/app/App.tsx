import { ExplorePage } from '../explore/ExplorePage';
import { LearnPage } from '../learn/LearnPage';
import { useHashRoute } from './hooks';
import { ServicesProvider, type Services } from './services';

export function App({ services }: { services: Services }) {
  const route = useHashRoute();
  return (
    <ServicesProvider value={services}>
      {route === 'learn' ? <LearnPage /> : <ExplorePage />}
    </ServicesProvider>
  );
}
