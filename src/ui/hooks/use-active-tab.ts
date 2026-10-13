import { useEffect, useState } from 'react';
import type { BrowserTab } from '@/application/ports';
import { useAppServices } from '../app-services-context';
import type { LoadState } from './use-repository-data';

/** The tab the popup was opened over. Read once, when the popup opens. */
export function useActiveTab(): LoadState<BrowserTab> {
  const { tabs } = useAppServices();
  const [state, setState] = useState<LoadState<BrowserTab>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void tabs.getActiveTab().then((result) => {
      if (!active) return;
      setState(
        result.ok
          ? { status: 'ready', value: result.value }
          : { status: 'error', message: result.error.message },
      );
    });
    return () => {
      active = false;
    };
  }, [tabs]);

  return state;
}
