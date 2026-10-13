import type { ResearchItem } from './research-item';
import { comparableUrl } from './url';

/** The parts of an item that decide whether it was already saved. */
export type DuplicateCandidate =
  { kind: 'page'; url: string } | { kind: 'highlight'; url: string; text: string };

/**
 * Two pages are duplicates when their comparable URLs match. Two highlights are
 * duplicates when they come from the same page and their text matches, ignoring
 * differences in whitespace. A page and a highlight are never duplicates.
 */
export function duplicateKey(candidate: DuplicateCandidate): string {
  const url = comparableUrlOrRaw(candidate.url);
  return candidate.kind === 'page'
    ? `page ${url}`
    : `highlight ${url} ${candidate.text.replace(/\s+/g, ' ').trim()}`;
}

export function findDuplicate(
  items: readonly ResearchItem[],
  candidate: DuplicateCandidate,
): ResearchItem | undefined {
  const key = duplicateKey(candidate);
  return items.find((item) => duplicateKey(item) === key);
}

function comparableUrlOrRaw(raw: string): string {
  try {
    return comparableUrl(new URL(raw));
  } catch {
    return raw;
  }
}
