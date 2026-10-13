import { findDuplicate } from '@/domain/duplicates';
import {
  createHighlightItem,
  createPageItem,
  type HighlightCapture,
  type NewItemContext,
  type PageCapture,
  type ResearchItem,
} from '@/domain/research-item';
import type { ValidationIssue } from '@/domain/validation';
import { err, ok, type Result } from '@/shared/result';
import { invalidInput, storageFailure, type AppError } from './errors';
import type { Clock, IdGenerator, ResearchRepository, StorageError } from './ports';

export type SaveDeps = { repository: ResearchRepository; clock: Clock; ids: IdGenerator };

/** A save either stores a new item or finds that the same item was saved before. */
export type SaveOutcome =
  { status: 'saved'; item: ResearchItem } | { status: 'duplicate'; item: ResearchItem };

export function savePage(
  deps: SaveDeps,
  capture: PageCapture,
): Promise<Result<SaveOutcome, AppError>> {
  return saveNewItem(deps, (context) => createPageItem(capture, context));
}

export function saveHighlight(
  deps: SaveDeps,
  capture: HighlightCapture,
): Promise<Result<SaveOutcome, AppError>> {
  return saveNewItem(deps, (context) => createHighlightItem(capture, context));
}

/** The saved item for this page address, if any (ignoring tracking parameters). */
export async function findSavedPage(
  repository: ResearchRepository,
  url: string,
): Promise<Result<ResearchItem | undefined, StorageError>> {
  const stored = await repository.list();
  if (!stored.ok) return stored;
  return ok(findDuplicate(stored.value.items, { kind: 'page', url }));
}

async function saveNewItem(
  deps: SaveDeps,
  build: (context: NewItemContext) => Result<ResearchItem, ValidationIssue[]>,
): Promise<Result<SaveOutcome, AppError>> {
  const built = build({ id: deps.ids.newId(), now: deps.clock.now() });
  if (!built.ok) return err(invalidInput(built.error));

  const stored = await deps.repository.list();
  if (!stored.ok) return err(storageFailure(stored.error));
  const existing = findDuplicate(stored.value.items, built.value);
  if (existing) return ok({ status: 'duplicate', item: existing });

  const saved = await deps.repository.save(built.value);
  if (!saved.ok) return err(storageFailure(saved.error));
  return ok({ status: 'saved', item: built.value });
}
