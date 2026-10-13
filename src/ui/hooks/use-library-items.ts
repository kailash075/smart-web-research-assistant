import type { ResearchRepository, StoredItems } from '@/application/ports';
import { useRepositoryData, type LoadState } from './use-repository-data';

const listItems = (repository: ResearchRepository) => repository.list();

/** Every readable item in the library, kept up to date. */
export function useLibraryItems(): LoadState<StoredItems> {
  return useRepositoryData(listItems);
}
