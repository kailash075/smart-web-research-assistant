import { useEffect, useState } from 'react';
import type { ResearchRepository, StorageError } from '@/application/ports';
import type { Result } from '@/shared/result';
import { useAppServices } from '../app-services-context';

export type LoadState<T> =
  { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; message: string };

/**
 * Loads data from the repository and loads it again whenever stored items change,
 * including changes made in other extension pages. `load` must keep the same
 * identity between renders (a module-level function or `useCallback`).
 */
export function useRepositoryData<T>(
  load: (repository: ResearchRepository) => Promise<Result<T, StorageError>>,
): LoadState<T> {
  const { repository } = useAppServices();
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const result = await load(repository);
      if (!active) return;
      setState(
        result.ok
          ? { status: 'ready', value: result.value }
          : { status: 'error', message: result.error.message },
      );
    };
    void refresh();
    const unsubscribe = repository.subscribe(() => void refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, load]);

  return state;
}
