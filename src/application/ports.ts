import type { ResearchItem, ResearchItemId } from '@/domain/research-item';
import type { Result } from '@/shared/result';

// Interfaces the application needs from the outside world. Infrastructure
// implements them; future cloud sync can provide another ResearchRepository.

export type StorageErrorKind =
  'unavailable' | 'quota_exceeded' | 'newer_schema' | 'invalid_data' | 'unknown';

export type StorageError = { kind: StorageErrorKind; message: string };

export type StoredItems = {
  items: ResearchItem[];
  /** Stored records that failed validation; they are skipped and left untouched. */
  skippedCount: number;
};

export type ResearchRepository = {
  list: () => Promise<Result<StoredItems, StorageError>>;
  get: (id: ResearchItemId) => Promise<Result<ResearchItem | undefined, StorageError>>;
  /** Inserts the item, or replaces the stored item with the same id. */
  save: (item: ResearchItem) => Promise<Result<void, StorageError>>;
  delete: (id: ResearchItemId) => Promise<Result<void, StorageError>>;
  /** Calls `listener` after items change in any extension page. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
};

/** Current time as an ISO 8601 UTC string. */
export type Clock = { now: () => string };

export type IdGenerator = { newId: () => ResearchItemId };

/**
 * A browser tab as the extension sees it. `url` and `title` are undefined when the
 * browser does not let the extension see the page (for example its settings pages).
 */
export type BrowserTab = { id: number; url: string | undefined; title: string | undefined };

/** `sensitive`: the selection is in a password field and must not be saved at all. */
export type PageAccessErrorKind = 'unavailable' | 'no_tab' | 'blocked' | 'sensitive';

export type PageAccessError = { kind: PageAccessErrorKind; message: string };

/** Reads from the user's tabs. Only works right after a user action (`activeTab`). */
export type TabsPort = {
  /** The focused tab of the current window. */
  getActiveTab: () => Promise<Result<BrowserTab, PageAccessError>>;
  /** Text the user selected in a frame of the tab (the top frame by default). */
  readSelection: (tabId: number, frameId?: number) => Promise<Result<string, PageAccessError>>;
};
