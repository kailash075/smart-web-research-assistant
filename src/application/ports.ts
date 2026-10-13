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
