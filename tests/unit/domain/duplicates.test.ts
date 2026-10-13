import { describe, expect, it } from 'vitest';
import { duplicateKey, findDuplicate } from '@/domain/duplicates';
import { makeHighlight, makePage } from '../support/items';

describe('duplicateKey', () => {
  it('treats the same page with a different fragment or tracking parameters as a duplicate', () => {
    const saved = duplicateKey({ kind: 'page', url: 'https://example.com/a?id=1' });
    expect(duplicateKey({ kind: 'page', url: 'https://example.com/a?id=1#intro' })).toBe(saved);
    expect(duplicateKey({ kind: 'page', url: 'https://example.com/a?id=1&utm_source=news' })).toBe(
      saved,
    );
  });

  it('treats different pages as different', () => {
    expect(duplicateKey({ kind: 'page', url: 'https://example.com/a' })).not.toBe(
      duplicateKey({ kind: 'page', url: 'https://example.com/b' }),
    );
  });

  it('matches highlights by page and text, ignoring whitespace differences', () => {
    expect(
      duplicateKey({ kind: 'highlight', url: 'https://example.com/a', text: 'Some  quoted\ntext' }),
    ).toBe(
      duplicateKey({
        kind: 'highlight',
        url: 'https://example.com/a#x',
        text: ' Some quoted text ',
      }),
    );
  });

  it('treats different text on the same page as different highlights', () => {
    expect(duplicateKey({ kind: 'highlight', url: 'https://example.com/a', text: 'one' })).not.toBe(
      duplicateKey({ kind: 'highlight', url: 'https://example.com/a', text: 'two' }),
    );
  });

  it('never treats a page and a highlight from it as duplicates', () => {
    expect(duplicateKey({ kind: 'page', url: 'https://example.com/a' })).not.toBe(
      duplicateKey({ kind: 'highlight', url: 'https://example.com/a', text: '' }),
    );
  });
});

describe('findDuplicate', () => {
  const page = makePage({ id: 'p', url: 'https://example.com/article' });
  const highlight = makeHighlight({ id: 'h', url: 'https://example.com/article', text: 'Quote' });

  it('returns the already-saved item', () => {
    expect(
      findDuplicate([page, highlight], { kind: 'page', url: 'https://example.com/article#top' }),
    ).toBe(page);
    expect(
      findDuplicate([page, highlight], { kind: 'highlight', url: page.url, text: 'Quote' }),
    ).toBe(highlight);
  });

  it('returns undefined when nothing matches', () => {
    expect(
      findDuplicate([page], { kind: 'page', url: 'https://example.com/other' }),
    ).toBeUndefined();
  });
});
