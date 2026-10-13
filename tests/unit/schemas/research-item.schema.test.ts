import { describe, expect, it } from 'vitest';
import type { HighlightItem } from '@/domain/research-item';
import { researchItemSchema } from '@/schemas/research-item.schema';
import { makeHighlight, makePage } from '../support/items';

describe('researchItemSchema', () => {
  it('accepts valid pages and highlights', () => {
    expect(researchItemSchema.safeParse(makePage({ tags: ['ai', 'reading list'] })).success).toBe(
      true,
    );
    expect(researchItemSchema.safeParse(makeHighlight({ note: 'why it matters' })).success).toBe(
      true,
    );
  });

  it('drops unknown fields', () => {
    const parsed = researchItemSchema.parse({ ...makePage(), favourite: true });
    expect(parsed).toEqual(makePage());
  });

  it.each([
    ['a javascript: URL', { url: 'javascript:alert(1)' }],
    ['a browser-internal URL', { url: 'chrome://settings' }],
    ['an empty title', { pageTitle: '' }],
    ['an unknown kind', { kind: 'bookmark' }],
    ['a date without time', { createdAt: '2026-10-13' }],
    ['a non-normalised tag', { tags: ['Research'] }],
    ['duplicate tags', { tags: ['ai', 'ai'] }],
    ['too many tags', { tags: Array.from({ length: 21 }, (_, index) => `t${String(index)}`) }],
    ['an overlong note', { note: 'n'.repeat(10_001) }],
    ['a missing id', { id: undefined }],
  ])('rejects %s', (_label, overrides) => {
    expect(researchItemSchema.safeParse({ ...makePage(), ...overrides }).success).toBe(false);
  });

  it('requires highlight text', () => {
    expect(researchItemSchema.safeParse(makeHighlight({ text: '' })).success).toBe(false);
    const withoutText: Partial<HighlightItem> = makeHighlight();
    delete withoutText.text;
    expect(researchItemSchema.safeParse(withoutText).success).toBe(false);
  });

  it('rejects values that are not objects', () => {
    for (const value of [null, 'item', 42, []]) {
      expect(researchItemSchema.safeParse(value).success).toBe(false);
    }
  });
});
