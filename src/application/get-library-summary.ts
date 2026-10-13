import type { Result } from '@/shared/result';
import { ok } from '@/shared/result';
import type { ResearchRepository, StorageError } from './ports';

export type LibrarySummary = {
  total: number;
  pages: number;
  highlights: number;
  /** Stored records that could not be read. */
  skipped: number;
};

export async function getLibrarySummary(
  repository: ResearchRepository,
): Promise<Result<LibrarySummary, StorageError>> {
  const stored = await repository.list();
  if (!stored.ok) return stored;

  const { items, skippedCount } = stored.value;
  const pages = items.filter((item) => item.kind === 'page').length;
  return ok({
    total: items.length,
    pages,
    highlights: items.length - pages,
    skipped: skippedCount,
  });
}
