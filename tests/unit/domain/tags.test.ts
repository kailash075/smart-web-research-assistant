import { describe, expect, it } from 'vitest';
import { normalizeTag, normalizeTags } from '@/domain/tags';

describe('normalizeTag', () => {
  it('trims, lowercases, collapses spaces and drops leading #', () => {
    expect(normalizeTag('  #Machine   Learning ')).toBe('machine learning');
  });

  it('returns an empty string when nothing is left', () => {
    expect(normalizeTag(' ### ')).toBe('');
  });
});

describe('normalizeTags', () => {
  it('removes empty tags and case-insensitive duplicates, keeping first-seen order', () => {
    expect(normalizeTags(['Research', '', 'ai', 'research', '#AI', 'books'])).toEqual({
      ok: true,
      value: ['research', 'ai', 'books'],
    });
  });

  it('rejects a tag longer than 40 characters', () => {
    const result = normalizeTags(['a'.repeat(41)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('too_long');
  });

  it('rejects more than 20 distinct tags', () => {
    const result = normalizeTags(Array.from({ length: 21 }, (_, index) => `tag ${String(index)}`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('too_many');
  });

  it('allows exactly 20 tags', () => {
    const result = normalizeTags(Array.from({ length: 20 }, (_, index) => `tag ${String(index)}`));
    expect(result.ok).toBe(true);
  });
});
