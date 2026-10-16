import { EMPTY_QUERY, queryLibrary } from '@/domain/library-query';
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile } from '@/schemas/export-file.schema';
import { err, ok, type Result } from '@/shared/result';
import { storageFailure, type AppError } from './errors';
import type { Clock, ResearchRepository } from './ports';

export type LibraryExport = {
  filename: string;
  /** The file content: pretty-printed JSON. */
  json: string;
  itemCount: number;
  /** Stored records that could not be read and so are not in the file. */
  skippedCount: number;
};

/** Builds a JSON backup of every readable item, oldest first. */
export async function exportLibrary(deps: {
  repository: ResearchRepository;
  clock: Clock;
}): Promise<Result<LibraryExport, AppError>> {
  const stored = await deps.repository.list();
  if (!stored.ok) return err(storageFailure(stored.error));

  const now = deps.clock.now();
  const items = queryLibrary(stored.value.items, { ...EMPTY_QUERY, sort: 'oldest' });
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now,
    items,
  };
  return ok({
    filename: `pagenest-export-${localDate(now)}.json`,
    json: `${JSON.stringify(file, null, 2)}\n`,
    itemCount: items.length,
    skippedCount: stored.value.skippedCount,
  });
}

// "2026-10-13" in the user's time zone, which matches the date they see.
function localDate(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
