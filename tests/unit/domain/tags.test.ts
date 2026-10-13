import { describe, expect, it } from 'vitest';
import { formatTagInput, normalizeTag, normalizeTags, parseTagInput } from '@/domain/tags';

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

describe('parseTagInput and formatTagInput', () => {
  it('splits a comma-separated field and leaves cleanup to normalizeTags', () => {
    expect(parseTagInput('Research, ai,, #books ')).toEqual(['Research', ' ai', '', ' #books ']);
    expect(normalizeTags(parseTagInput('Research, ai,, #books '))).toEqual({
      ok: true,
      value: ['research', 'ai', 'books'],
    });
  });

  it('round-trips stored tags', () => {
    expect(formatTagInput(['research', 'machine learning'])).toBe('research, machine learning');
    expect(normalizeTags(parseTagInput(formatTagInput(['a', 'b c'])))).toEqual({
      ok: true,
      value: ['a', 'b c'],
    });
  });
});
