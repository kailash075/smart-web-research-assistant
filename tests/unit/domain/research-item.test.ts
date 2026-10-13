import { describe, expect, it } from 'vitest';
import {
  createHighlightItem,
  createPageItem,
  updateItemDetails,
  type NewItemContext,
} from '@/domain/research-item';
import type { ValidationIssue } from '@/domain/validation';
import { LATER, makeHighlight, makePage, NOW } from '../support/items';

const context: NewItemContext = { id: 'id-1', now: NOW };

const codes = (issues: ValidationIssue[]) => issues.map(({ field, code }) => `${field}:${code}`);

describe('createPageItem', () => {
  it('creates a page item with timestamps and empty note and tags', () => {
    const result = createPageItem({ url: 'https://example.com/a', title: 'Example' }, context);

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'id-1',
        kind: 'page',
        url: 'https://example.com/a',
        pageTitle: 'Example',
        note: '',
        tags: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
  });

  it('cleans up whitespace in the title', () => {
    const result = createPageItem(
      { url: 'https://example.com', title: '  Two \n  lines ' },
      context,
    );
    expect(result.ok && result.value.pageTitle).toBe('Two lines');
  });

  it('falls back to the site name when the page has no title', () => {
    const result = createPageItem({ url: 'https://www.example.com/a', title: '  ' }, context);
    expect(result.ok && result.value.pageTitle).toBe('example.com');
  });

  it('shortens very long titles instead of rejecting them', () => {
    const result = createPageItem({ url: 'https://example.com', title: 'x'.repeat(600) }, context);
    expect(result.ok && result.value.pageTitle).toHaveLength(500);
    expect(result.ok && result.value.pageTitle.endsWith('…')).toBe(true);
  });

  it('normalises an optional note and tags', () => {
    const result = createPageItem(
      {
        url: 'https://example.com',
        title: 'T',
        note: '  my note \r\n',
        tags: ['AI', 'ai', ' Ml '],
      },
      context,
    );
    expect(result.ok && result.value.note).toBe('my note');
    expect(result.ok && result.value.tags).toEqual(['ai', 'ml']);
  });

  it('rejects pages that cannot be saved', () => {
    const result = createPageItem({ url: 'chrome://settings', title: 'Settings' }, context);
    expect(!result.ok && codes(result.error)).toEqual(['url:unsupported_url']);
  });

  it('reports every invalid field at once', () => {
    const result = createPageItem(
      { url: 'nope', title: 'T', note: 'n'.repeat(10_001), tags: ['t'.repeat(41)] },
      context,
    );
    expect(!result.ok && codes(result.error)).toEqual([
      'url:invalid_url',
      'note:too_long',
      'tags:too_long',
    ]);
  });
});

describe('createHighlightItem', () => {
  it('keeps the selected text, trimmed, with normalised line endings', () => {
    const result = createHighlightItem(
      { url: 'https://example.com', title: 'T', text: '\n First line\r\nSecond line  ' },
      context,
    );
    expect(result.ok && result.value).toMatchObject({
      kind: 'highlight',
      text: 'First line\nSecond line',
      url: 'https://example.com/',
    });
  });

  it('requires some selected text', () => {
    const result = createHighlightItem(
      { url: 'https://example.com', title: 'T', text: ' \n ' },
      context,
    );
    expect(!result.ok && codes(result.error)).toEqual(['text:required']);
  });

  it('rejects selections over 20,000 characters', () => {
    const result = createHighlightItem(
      { url: 'https://example.com', title: 'T', text: 'a'.repeat(20_001) },
      context,
    );
    expect(!result.ok && codes(result.error)).toEqual(['text:too_long']);
  });

  it('reports URL and text problems together', () => {
    const result = createHighlightItem({ url: 'about:blank', title: 'T', text: '' }, context);
    expect(!result.ok && codes(result.error)).toEqual(['url:unsupported_url', 'text:required']);
  });
});

describe('updateItemDetails', () => {
  it('updates note and tags and bumps updatedAt only', () => {
    const item = makeHighlight({ note: 'old', tags: ['a'] });

    const result = updateItemDetails(item, { note: ' new note ', tags: ['B', 'c'] }, LATER);

    expect(result).toEqual({
      ok: true,
      value: { ...item, note: 'new note', tags: ['b', 'c'], updatedAt: LATER },
    });
  });

  it('leaves fields that are not part of the change alone', () => {
    const item = makePage({ note: 'keep me', tags: ['x'] });
    const result = updateItemDetails(item, { tags: ['y'] }, LATER);
    expect(result.ok && result.value).toMatchObject({ note: 'keep me', tags: ['y'] });
  });

  it('returns the same item when nothing actually changes', () => {
    const item = makePage({ note: 'same', tags: ['x'] });
    const result = updateItemDetails(item, { note: ' same ', tags: ['X'] }, LATER);
    expect(result.ok && result.value).toBe(item);
  });

  it('rejects an overlong note', () => {
    const result = updateItemDetails(makePage(), { note: 'n'.repeat(10_001) }, LATER);
    expect(!result.ok && codes(result.error)).toEqual(['note:too_long']);
  });
});
