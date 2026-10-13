import type {
  BrowserTab,
  Clock,
  IdGenerator,
  PageAccessError,
  ResearchRepository,
  StorageError,
  TabsPort,
} from '@/application/ports';
import type { ResearchItem } from '@/domain/research-item';
import { err, ok, type Result } from '@/shared/result';
import { NOW } from './items';

export type MemoryRepository = {
  repository: ResearchRepository;
  /** The stored items, by id. */
  items: Map<string, ResearchItem>;
  /** Number of successful `save` calls. */
  saveCount: () => number;
  /** Makes every later call fail with `error` (or succeed again with `undefined`). */
  failWith: (error: StorageError | undefined) => void;
};

/** A ResearchRepository that keeps items in a Map. */
export function createMemoryRepository(initial: readonly ResearchItem[] = []): MemoryRepository {
  const items = new Map(initial.map((item) => [item.id, item]));
  const listeners = new Set<() => void>();
  let failure: StorageError | undefined;
  let saves = 0;

  const run = <T>(operation: () => T): Promise<Result<T, StorageError>> =>
    Promise.resolve(failure ? err(failure) : ok(operation()));
  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    items,
    saveCount: () => saves,
    failWith: (error) => {
      failure = error;
    },
    repository: {
      list: () => run(() => ({ items: [...items.values()], skippedCount: 0 })),
      get: (id) => run(() => items.get(id)),
      save: (item) =>
        run(() => {
          items.set(item.id, item);
          saves += 1;
          notify();
        }),
      delete: (id) =>
        run(() => {
          items.delete(id);
          notify();
        }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
}

export const fixedClock: Clock = { now: () => NOW };

/** Hands out `id-1`, `id-2`, … */
export function sequentialIds(): IdGenerator {
  let next = 1;
  return { newId: () => `id-${String(next++)}` };
}

export type FakeTabs = TabsPort & {
  /** Every readSelection call, in order. */
  selectionReads: { tabId: number; frameId: number | undefined }[];
};

export function createFakeTabs(
  selection: Result<string, PageAccessError> = ok(''),
  activeTab: Result<BrowserTab, PageAccessError> = ok(articleTab()),
): FakeTabs {
  const selectionReads: FakeTabs['selectionReads'] = [];
  return {
    selectionReads,
    getActiveTab: () => Promise.resolve(activeTab),
    readSelection: (tabId, frameId) => {
      selectionReads.push({ tabId, frameId });
      return Promise.resolve(selection);
    },
  };
}

export function articleTab(overrides: Partial<BrowserTab> = {}): BrowserTab {
  return { id: 7, url: 'https://example.com/article', title: 'An article', ...overrides };
}
