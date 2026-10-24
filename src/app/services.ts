import { createContext, useContext } from 'react';
import type { Geocoder } from '../geo/nominatim';
import type { TrafficService } from '../traffic/settings';
import type { SearchClient } from '../worker/client';

/** Everything that talks to the outside world, so tests can swap in fakes. */
export interface Services {
  geocoder: Geocoder;
  searchClient: Pick<SearchClient, 'run' | 'savedAreas' | 'forgetArea'>;
  traffic: TrafficService;
}

const ServicesContext = createContext<Services | null>(null);
export const ServicesProvider = ServicesContext.Provider;

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside a ServicesProvider');
  return services;
}
