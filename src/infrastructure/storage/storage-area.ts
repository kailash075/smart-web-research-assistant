import { browser } from 'wxt/browser';

/** The subset of `browser.storage.StorageArea` the repository uses. */
export type StorageAreaLike = {
  get: (keys: string | string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  onChanged: {
    addListener: (callback: (changes: Record<string, unknown>) => void) => void;
    removeListener: (callback: (changes: Record<string, unknown>) => void) => void;
  };
};

/**
 * `browser.storage.local`, or undefined when the API is missing (for example when the
 * `storage` permission is absent or the code runs outside an extension page).
 */
export function getLocalStorageArea(): StorageAreaLike | undefined {
  const api = browser as Partial<typeof browser>;
  return api.storage?.local;
}
