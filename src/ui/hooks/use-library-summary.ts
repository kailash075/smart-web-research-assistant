import { useEffect, useState } from 'react';
import { getLibrarySummary, type LibrarySummary } from '@/application/get-library-summary';
import { useAppServices } from '../app-services-context';

export type LibrarySummaryState =
  | { status: 'loading' }
  | { status: 'ready'; summary: LibrarySummary }
  | { status: 'error'; message: string };

/** Loads the library summary and refreshes it whenever stored items change. */
export function useLibrarySummary(): LibrarySummaryState {
  const { repository } = useAppServices();
  const [state, setState] = useState<LibrarySummaryState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await getLibrarySummary(repository);
      if (!active) return;
      setState(
        result.ok
          ? { status: 'ready', summary: result.value }
          : { status: 'error', message: result.error.message },
      );
    };
    void load();
    const unsubscribe = repository.subscribe(() => void load());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository]);

  return state;
}
