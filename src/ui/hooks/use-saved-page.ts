import { useCallback } from 'react';
import type { ResearchRepository } from '@/application/ports';
import { findSavedPage } from '@/application/save-item';
import type { ResearchItem } from '@/domain/research-item';
import { useRepositoryData, type LoadState } from './use-repository-data';

/** The saved item for a page address, or undefined when the page is not saved yet. */
export function useSavedPage(url: string): LoadState<ResearchItem | undefined> {
  const load = useCallback(
    (repository: ResearchRepository) => findSavedPage(repository, url),
    [url],
  );
  return useRepositoryData(load);
}
