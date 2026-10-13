import { getLibrarySummary, type LibrarySummary } from '@/application/get-library-summary';
import { useRepositoryData, type LoadState } from './use-repository-data';

/** The library's item counts, kept up to date. */
export function useLibrarySummary(): LoadState<LibrarySummary> {
  return useRepositoryData(getLibrarySummary);
}
