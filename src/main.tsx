import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/global.css';
import './styles/maplibre.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createNominatim } from './geo/nominatim';
import { browserTraffic } from './traffic/settings';
import { createSearchClient, type WorkerLike } from './worker/client';

const worker = new Worker(new URL('./worker/search.worker.ts', import.meta.url), {
  type: 'module',
});
const services = {
  geocoder: createNominatim(),
  searchClient: createSearchClient(worker as unknown as WorkerLike),
  traffic: browserTraffic(),
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
