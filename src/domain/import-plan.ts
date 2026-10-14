import { duplicateKey } from './duplicates';
import type { ResearchItem, ResearchItemId } from './research-item';

/**
 * What to do with an imported item that is already in the library but differs
 * (for example in its note or tags). Items are never replaced unless the user
 * chooses `replace`.
 */
export type ConflictPolicy = 'keep-existing' | 'replace';

export type ImportCounts = {
  /** Items not in the library yet. */
  added: number;
  /** Items already in the library with the same content. */
  unchanged: number;
  /** Items already in the library with different content. */
  conflicts: number;
  /** Items that appeared more than once in the file; only the first is used. */
  repeated: number;
};

export type ImportPlan = {
  counts: ImportCounts;
  /** Items to write: new ones, plus replacements when the policy is `replace`. */
  toWrite: ResearchItem[];
};

/**
 * Decides how imported items merge into the library. An imported item matches a
 * saved one when it is the same page or the same highlight (see `duplicateKey`).
 * A new item whose id is already taken by a different item gets a fresh id.
 */
export function planImport(
  existing: readonly ResearchItem[],
  incoming: readonly ResearchItem[],
  policy: ConflictPolicy,
  newId: () => ResearchItemId,
): ImportPlan {
  const byKey = new Map(existing.map((item) => [duplicateKey(item), item]));
  const takenIds = new Set(existing.map((item) => item.id));
  const seenKeys = new Set<string>();
  const counts: ImportCounts = { added: 0, unchanged: 0, conflicts: 0, repeated: 0 };
  const toWrite: ResearchItem[] = [];

  for (const item of incoming) {
    const key = duplicateKey(item);
    if (seenKeys.has(key)) {
      counts.repeated += 1;
      continue;
    }
    seenKeys.add(key);

    const match = byKey.get(key);
    if (!match) {
      const id = takenIds.has(item.id) ? newId() : item.id;
      takenIds.add(id);
      counts.added += 1;
      toWrite.push({ ...item, id });
    } else if (sameContent(match, item)) {
      counts.unchanged += 1;
    } else {
      counts.conflicts += 1;
      // The saved item keeps its id, so nothing else refers to a missing item.
      if (policy === 'replace') toWrite.push({ ...item, id: match.id });
    }
  }
  return { counts, toWrite };
}

// Content the user sees and edits. Ids and timestamps do not count.
function sameContent(a: ResearchItem, b: ResearchItem): boolean {
  return (
    a.kind === b.kind &&
    a.url === b.url &&
    a.pageTitle === b.pageTitle &&
    a.note === b.note &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index]) &&
    (a.kind === 'page' || b.kind === 'page' || a.text === b.text)
  );
}
