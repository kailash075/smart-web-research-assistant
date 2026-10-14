import { planImport, type ConflictPolicy, type ImportCounts } from '@/domain/import-plan';
import type { ResearchItem } from '@/domain/research-item';
import { EXPORT_FORMAT, EXPORT_VERSION, exportFileSchema } from '@/schemas/export-file.schema';
import { researchItemSchema } from '@/schemas/research-item.schema';
import { err, ok, type Result } from '@/shared/result';
import { storageFailure, type AppError } from './errors';
import type { IdGenerator, ResearchRepository } from './ports';

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_ITEMS = 50_000;
const MAX_LISTED_PROBLEMS = 5;

/** The valid content of an import file, ready to preview or import. */
export type ImportFile = {
  items: ResearchItem[];
  /** Entries that are not valid items. They are skipped. */
  invalidCount: number;
  /** Why the first few invalid entries were rejected, for the user. */
  problems: string[];
};

export type ImportDeps = { repository: ResearchRepository; ids: IdGenerator };

/** What an import did (or would do), in numbers. */
export type ImportSummary = ImportCounts & {
  /** Conflicting items that were replaced with the file's version. */
  replaced: number;
  invalid: number;
};

/** Rejects files too large to import safely, before they are read. */
export function checkImportSize(bytes: number): Result<void, AppError> {
  return bytes > MAX_IMPORT_BYTES
    ? err(invalidFile('This file is too large to import (the limit is 25 MB).'))
    : ok(undefined);
}

/** Parses and validates the text of a file exported from Recall. */
export function readImportFile(text: string): Result<ImportFile, AppError> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return err(invalidFile('This file is not valid JSON. Choose a file exported from Recall.'));
  }
  if (!isRecord(data) || data['format'] !== EXPORT_FORMAT) {
    return err(invalidFile('This is not a Recall export file.'));
  }
  // Checked before the shape, because a newer version may use a different shape.
  const version = data['version'];
  if (typeof version === 'number' && version > EXPORT_VERSION) {
    return err(
      invalidFile(
        'This file was exported by a newer version of Recall. Update Recall to import it.',
      ),
    );
  }
  const envelope = exportFileSchema.safeParse(data);
  if (!envelope.success) {
    return err(invalidFile('This Recall export file is damaged and cannot be imported.'));
  }
  const entries = envelope.data.items;
  if (entries.length > MAX_IMPORT_ITEMS) {
    return err(
      invalidFile(
        `This file has more than ${MAX_IMPORT_ITEMS.toLocaleString('en')} items, which is more than Recall can import at once.`,
      ),
    );
  }

  const file: ImportFile = { items: [], invalidCount: 0, problems: [] };
  entries.forEach((entry, index) => {
    const parsed = researchItemSchema.safeParse(entry);
    if (parsed.success) {
      file.items.push(parsed.data);
      return;
    }
    file.invalidCount += 1;
    const [issue] = parsed.error.issues;
    if (issue && file.problems.length < MAX_LISTED_PROBLEMS) {
      const field = issue.path.join('.');
      file.problems.push(
        `Item ${String(index + 1)}: ${field === '' ? '' : `${field}: `}${issue.message}`,
      );
    }
  });
  return ok(file);
}

/** What importing the file would do, without changing anything. */
export async function previewImport(
  deps: ImportDeps,
  file: ImportFile,
  policy: ConflictPolicy,
): Promise<Result<ImportSummary, AppError>> {
  const stored = await deps.repository.list();
  if (!stored.ok) return err(storageFailure(stored.error));
  const plan = planImport(stored.value.items, file.items, policy, deps.ids.newId);
  return ok(summarize(plan.counts, file, policy));
}

/**
 * Adds the file's new items to the library in one write. Items that are already
 * saved but differ are only replaced when `policy` is `replace`.
 */
export async function applyImport(
  deps: ImportDeps,
  file: ImportFile,
  policy: ConflictPolicy,
): Promise<Result<ImportSummary, AppError>> {
  // Planned again against the current library, which may have changed since the preview.
  const stored = await deps.repository.list();
  if (!stored.ok) return err(storageFailure(stored.error));
  const plan = planImport(stored.value.items, file.items, policy, deps.ids.newId);
  const saved = await deps.repository.saveMany(plan.toWrite);
  if (!saved.ok) return err(storageFailure(saved.error));
  return ok(summarize(plan.counts, file, policy));
}

function summarize(counts: ImportCounts, file: ImportFile, policy: ConflictPolicy): ImportSummary {
  return {
    ...counts,
    replaced: policy === 'replace' ? counts.conflicts : 0,
    invalid: file.invalidCount,
  };
}

function invalidFile(message: string): AppError {
  return { kind: 'invalid_file', message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
