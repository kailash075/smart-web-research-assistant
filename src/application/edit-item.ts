import {
  updateItemDetails,
  type ItemDetailsChanges,
  type ResearchItem,
  type ResearchItemId,
} from '@/domain/research-item';
import { err, ok, type Result } from '@/shared/result';
import { invalidInput, storageFailure, type AppError } from './errors';
import type { Clock, ResearchRepository } from './ports';

export type EditDeps = { repository: ResearchRepository; clock: Clock };

/** Changes an item's note and tags. Returns the item as stored afterwards. */
export async function updateItem(
  deps: EditDeps,
  id: ResearchItemId,
  changes: ItemDetailsChanges,
): Promise<Result<ResearchItem, AppError>> {
  const found = await deps.repository.get(id);
  if (!found.ok) return err(storageFailure(found.error));
  if (!found.value) return err(NOT_FOUND);

  const updated = updateItemDetails(found.value, changes, deps.clock.now());
  if (!updated.ok) return err(invalidInput(updated.error));
  if (updated.value === found.value) return ok(found.value);

  const saved = await deps.repository.save(updated.value);
  return saved.ok ? ok(updated.value) : err(storageFailure(saved.error));
}

/** Permanently removes an item. Deleting an item that is already gone succeeds. */
export async function deleteItem(
  deps: Pick<EditDeps, 'repository'>,
  id: ResearchItemId,
): Promise<Result<void, AppError>> {
  const deleted = await deps.repository.delete(id);
  return deleted.ok ? deleted : err(storageFailure(deleted.error));
}

const NOT_FOUND: AppError = {
  kind: 'not_found',
  message: 'This item no longer exists. It may have been deleted in another window.',
};
