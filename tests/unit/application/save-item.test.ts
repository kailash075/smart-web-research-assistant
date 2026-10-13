import { describe, expect, it } from 'vitest';
import { findSavedPage, saveHighlight, savePage, type SaveDeps } from '@/application/save-item';
import { createMemoryRepository, fixedClock, sequentialIds } from '../support/fakes';
import { makeHighlight, makePage, NOW } from '../support/items';

function setup(...initial: Parameters<typeof createMemoryRepository>) {
  const memory = createMemoryRepository(...initial);
  const deps: SaveDeps = { repository: memory.repository, clock: fixedClock, ids: sequentialIds() };
  return { memory, deps };
}

describe('savePage', () => {
  it('stores a new page with a generated id, the current time, and the user note and tags', async () => {
    const { memory, deps } = setup();

    const result = await savePage(deps, {
      url: 'https://example.com/article',
      title: '  An   article ',
      note: 'Read later',
      tags: ['Research', '#AI'],
    });

    const expected = {
      id: 'id-1',
      kind: 'page',
      url: 'https://example.com/article',
      pageTitle: 'An article',
      note: 'Read later',
      tags: ['research', 'ai'],
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(result).toEqual({ ok: true, value: { status: 'saved', item: expected } });
    expect(memory.items.get('id-1')).toEqual(expected);
  });

  it('returns the existing item instead of saving the same page twice', async () => {
    const existing = makePage({ id: 'old', url: 'https://example.com/article' });
    const { memory, deps } = setup([existing]);

    const result = await savePage(deps, {
      url: 'https://example.com/article?utm_source=newsletter#comments',
      title: 'An article',
    });

    expect(result).toEqual({ ok: true, value: { status: 'duplicate', item: existing } });
    expect(memory.saveCount()).toBe(0);
  });

  it('saves a page even when a highlight from it is already saved', async () => {
    const { deps } = setup([makeHighlight({ url: 'https://example.com/article' })]);

    const result = await savePage(deps, { url: 'https://example.com/article', title: 'A' });

    expect(result.ok && result.value.status).toBe('saved');
  });

  it('rejects pages that are not on the web without touching storage', async () => {
    const { memory, deps } = setup();

    const result = await savePage(deps, { url: 'about:blank', title: '' });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'invalid', message: 'Only web pages (http or https) can be saved.' },
    });
    expect(memory.saveCount()).toBe(0);
  });

  it('reports storage failures with the storage message', async () => {
    const { memory, deps } = setup();
    memory.failWith({ kind: 'quota_exceeded', message: 'Browser storage is full.' });

    expect(await savePage(deps, { url: 'https://example.com/', title: 'Home' })).toEqual({
      ok: false,
      error: { kind: 'storage', message: 'Browser storage is full.' },
    });
  });
});

describe('saveHighlight', () => {
  const capture = { url: 'https://example.com/article', title: 'An article' };

  it('stores the selected text', async () => {
    const { memory, deps } = setup();

    const result = await saveHighlight(deps, { ...capture, text: '  Quoted\r\ntext ' });

    expect(result.ok && result.value.status).toBe('saved');
    expect(memory.items.get('id-1')).toMatchObject({ kind: 'highlight', text: 'Quoted\ntext' });
  });

  it('treats the same text from the same page as a duplicate, ignoring whitespace', async () => {
    const existing = makeHighlight({ id: 'old', text: 'A quoted sentence.' });
    const { memory, deps } = setup([existing]);

    const result = await saveHighlight(deps, { ...capture, text: 'A  quoted\nsentence.' });

    expect(result).toEqual({ ok: true, value: { status: 'duplicate', item: existing } });
    expect(memory.saveCount()).toBe(0);
  });

  it('asks the user to select text when the selection is empty', async () => {
    const { deps } = setup();

    expect(await saveHighlight(deps, { ...capture, text: '   ' })).toMatchObject({
      ok: false,
      error: { kind: 'invalid', message: 'Select some text on the page first.' },
    });
  });
});

describe('findSavedPage', () => {
  it('finds a saved page by address, ignoring tracking parameters', async () => {
    const page = makePage({ url: 'https://example.com/article' });
    const { memory } = setup([page, makeHighlight()]);

    expect(
      await findSavedPage(memory.repository, 'https://example.com/article?fbclid=abc'),
    ).toEqual({ ok: true, value: page });
    expect(await findSavedPage(memory.repository, 'https://example.com/other')).toEqual({
      ok: true,
      value: undefined,
    });
  });
});
