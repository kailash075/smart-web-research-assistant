import type { Clock, IdGenerator, ResearchRepository, TabsPort } from '@/application/ports';
import { createBrowserTabs } from '@/infrastructure/browser/browser-tabs';
import { createBrowserStorageResearchRepository } from '@/infrastructure/storage/browser-storage-research-repository';
import { getLocalStorageArea } from '@/infrastructure/storage/storage-area';
import { randomIds, systemClock } from '@/infrastructure/system';

/** Concrete implementations of the application's ports, shared by the UI and background. */
export type AppServices = {
  repository: ResearchRepository;
  tabs: TabsPort;
  clock: Clock;
  ids: IdGenerator;
};

export function createAppServices(): AppServices {
  return {
    repository: createBrowserStorageResearchRepository(getLocalStorageArea()),
    tabs: createBrowserTabs(),
    clock: systemClock,
    ids: randomIds,
  };
}
