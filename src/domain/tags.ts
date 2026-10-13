import { err, ok, type Result } from '@/shared/result';
import { issue, LIMITS, type ValidationIssue } from './validation';

/** Lowercase, trimmed, single-spaced, without a leading `#`. Empty if nothing remains. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Normalises and de-duplicates tags, keeping first-seen order. */
export function normalizeTags(raw: readonly string[]): Result<string[], ValidationIssue> {
  const tags = [...new Set(raw.map(normalizeTag).filter((tag) => tag !== ''))];
  const tooLong = tags.find((tag) => tag.length > LIMITS.tagLength);
  if (tooLong !== undefined) {
    return err(
      issue(
        'tags',
        'too_long',
        `Tag "${tooLong.slice(0, 20)}…" is longer than ${String(LIMITS.tagLength)} characters.`,
      ),
    );
  }
  if (tags.length > LIMITS.tagCount) {
    return err(
      issue('tags', 'too_many', `An item can have at most ${String(LIMITS.tagCount)} tags.`),
    );
  }
  return ok(tags);
}
