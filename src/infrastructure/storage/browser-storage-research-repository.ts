import type { ResearchRepository, StorageError, StoredItems } from '@/application/ports';
import type { ResearchItem, ResearchItemId } from '@/domain/research-item';
import { researchItemSchema } from '@/schemas/research-item.schema';
import { err, ok, type Result } from '@/shared/result';
import type { StorageAreaLike } from './storage-area';

// Storage layout (schema version 1):
//   "meta:schemaVersion" -> 1
//   "item:<id>"          -> ResearchItem as plain JSON
// One key per item, so two extension pages editing different items never
// overwrite each other's changes.

export const ITEM_KEY_PREFIX = 'item:';
export const SCHEMA_VERSION_KEY = 'meta:schemaVersion';
export const CURRENT_SCHEMA_VERSION = 1;

const itemKey = (id: ResearchItemId) => `${ITEM_KEY_PREFIX}${id}`;

export function createBrowserStorageResearchRepository(
  area: StorageAreaLike | undefined,
): ResearchRepository {
  let schemaCheck: Promise<Result<void, StorageError>> | undefined;

  // Checked once per page; a failed check is retried on the next call.
  function ensureCompatibleSchema(storage: StorageAreaLike): Promise<Result<void, StorageError>> {
    schemaCheck ??= checkSchemaVersion(storage)
      .catch((error: unknown) => err(toStorageError(error)))
      .then((result) => {
        if (!result.ok) schemaCheck = undefined;
        return result;
      });
    return schemaCheck;
  }

  async function run<T>(
    operation: (storage: StorageAreaLike) => Promise<Result<T, StorageError>>,
  ): Promise<Result<T, StorageError>> {
    if (!area) return err(UNAVAILABLE);
    try {
      const compatible = await ensureCompatibleSchema(area);
      if (!compatible.ok) return compatible;
      return await operation(area);
    } catch (error) {
      return err(toStorageError(error));
    }
  }

  return {
    list: () =>
      run(async (storage) => {
        const all = await storage.get(null);
        const result: StoredItems = { items: [], skippedCount: 0 };
        for (const [key, value] of Object.entries(all)) {
          if (!key.startsWith(ITEM_KEY_PREFIX)) continue;
          const item = parseStoredItem(key, value);
          if (item) result.items.push(item);
          else result.skippedCount += 1;
        }
        if (result.skippedCount > 0) {
          console.warn(
            `[Recall] Skipped ${String(result.skippedCount)} unreadable stored item(s).`,
          );
        }
        return ok(result);
      }),

    get: (id) =>
      run(async (storage) => {
        const key = itemKey(id);
        const value = (await storage.get(key))[key];
        if (value === undefined) return ok(undefined);
        const item = parseStoredItem(key, value);
        return item ? ok(item) : err(INVALID_STORED_ITEM);
      }),

    save: (item) =>
      run(async (storage) => {
        // Never write data the app could not read back.
        const checked = researchItemSchema.safeParse(item);
        if (!checked.success) return err(INVALID_NEW_ITEM);
        await storage.set({ [itemKey(item.id)]: checked.data });
        return ok(undefined);
      }),

    delete: (id) =>
      run(async (storage) => {
        await storage.remove(itemKey(id));
        return ok(undefined);
      }),

    subscribe: (listener) => {
      if (!area) return () => undefined;
      const onChanged = (changes: Record<string, unknown>) => {
        if (Object.keys(changes).some((key) => key.startsWith(ITEM_KEY_PREFIX))) listener();
      };
      area.onChanged.addListener(onChanged);
      return () => {
        area.onChanged.removeListener(onChanged);
      };
    },
  };
}

async function checkSchemaVersion(storage: StorageAreaLike): Promise<Result<void, StorageError>> {
  const version = (await storage.get(SCHEMA_VERSION_KEY))[SCHEMA_VERSION_KEY];
  if (version === undefined) {
    await storage.set({ [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION });
    return ok(undefined);
  }
  if (version === CURRENT_SCHEMA_VERSION) return ok(undefined);
  if (
    typeof version === 'number' &&
    Number.isInteger(version) &&
    version > CURRENT_SCHEMA_VERSION
  ) {
    return err(NEWER_SCHEMA);
  }
  // Older versions would be migrated here once a version 2 exists.
  return err({ kind: 'invalid_data', message: 'Saved data has an unrecognised format version.' });
}

function parseStoredItem(key: string, value: unknown): ResearchItem | undefined {
  const parsed = researchItemSchema.safeParse(value);
  return parsed.success && itemKey(parsed.data.id) === key ? parsed.data : undefined;
}

function toStorageError(error: unknown): StorageError {
  const detail = error instanceof Error ? error.message : String(error);
  if (/quota/i.test(detail)) {
    return {
      kind: 'quota_exceeded',
      message: 'Browser storage is full. Delete some items or export a backup to free space.',
    };
  }
  return { kind: 'unknown', message: `Could not access browser storage (${detail}).` };
}

const UNAVAILABLE: StorageError = {
  kind: 'unavailable',
  message: 'Browser storage is not available, so research cannot be saved.',
};

const NEWER_SCHEMA: StorageError = {
  kind: 'newer_schema',
  message:
    'Your saved research was created by a newer version of Recall. Update the extension to use it.',
};

const INVALID_STORED_ITEM: StorageError = {
  kind: 'invalid_data',
  message: 'This saved item is damaged and cannot be read.',
};

const INVALID_NEW_ITEM: StorageError = {
  kind: 'invalid_data',
  message: 'The item has invalid data and was not saved.',
};
