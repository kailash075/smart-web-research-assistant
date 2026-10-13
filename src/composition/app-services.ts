import type { ResearchRepository } from '@/application/ports';
import { createBrowserStorageResearchRepository } from '@/infrastructure/storage/browser-storage-research-repository';
import { getLocalStorageArea } from '@/infrastructure/storage/storage-area';

/** Concrete implementations of the application's ports, shared by the UI. */
export type AppServices = {
  repository: ResearchRepository;
};

export function createAppServices(): AppServices {
  return {
    repository: createBrowserStorageResearchRepository(getLocalStorageArea()),
  };
}
