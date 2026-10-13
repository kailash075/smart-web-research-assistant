import { describe, expect, it } from 'vitest';
import {
  pageFromTab,
  savePageFromTab,
  saveSelectionFromTab,
  type TabSaveDeps,
} from '@/application/save-from-tab';
import type { PageAccessError } from '@/application/ports';
import { err, ok, type Result } from '@/shared/result';
import {
  articleTab,
  createFakeTabs,
  createMemoryRepository,
  fixedClock,
  sequentialIds,
} from '../support/fakes';

const BLOCKED: PageAccessError = { kind: 'blocked', message: 'This page is protected.' };

function setup(selection: Result<string, PageAccessError> = ok('')) {
  const memory = createMemoryRepository();
  const tabs = createFakeTabs(selection);
  const deps: TabSaveDeps = {
    repository: memory.repository,
    clock: fixedClock,
    ids: sequentialIds(),
    tabs,
  };
  return { memory, tabs, deps };
}

describe('pageFromTab', () => {
  it('returns the address and title of a web page', () => {
    expect(pageFromTab(articleTab())).toEqual({
      ok: true,
      value: { url: 'https://example.com/article', title: 'An article' },
    });
  });

  it('explains that browser pages are off limits when the address is hidden', () => {
    const result = pageFromTab(articleTab({ url: undefined, title: undefined }));
    expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported_page' } });
    if (!result.ok) expect(result.error.message).toContain("Recall can't save this page");
  });

  it('rejects pages that are not http or https', () => {
    expect(pageFromTab(articleTab({ url: 'file:///home/me/notes.txt' }))).toEqual({
      ok: false,
      error: {
        kind: 'unsupported_page',
        message: 'Only web pages (http or https) can be saved.',
      },
    });
  });
});

describe('savePageFromTab', () => {
  it('saves the tab with the note and tags the user typed', async () => {
    const { memory, deps } = setup();

    const result = await savePageFromTab(deps, articleTab(), { note: 'Why', tags: ['x'] });

    expect(result.ok && result.value.status).toBe('saved');
    expect(memory.items.get('id-1')).toMatchObject({ kind: 'page', note: 'Why', tags: ['x'] });
  });

  it('saves nothing for an unsupported tab', async () => {
    const { memory, deps } = setup();

    const result = await savePageFromTab(deps, articleTab({ url: 'chrome://settings/' }));

    expect(result.ok).toBe(false);
    expect(memory.saveCount()).toBe(0);
  });
});

describe('saveSelectionFromTab', () => {
  it('reads the selection from the frame that holds it', async () => {
    const { memory, tabs, deps } = setup(ok('Selected words'));

    const result = await saveSelectionFromTab(deps, articleTab(), { note: 'n' }, { frameId: 3 });

    expect(result.ok && result.value.status).toBe('saved');
    expect(tabs.selectionReads).toEqual([{ tabId: 7, frameId: 3 }]);
    expect(memory.items.get('id-1')).toMatchObject({ text: 'Selected words', note: 'n' });
  });

  it('prefers the text read from the page over the text the browser reported', async () => {
    const { memory, deps } = setup(ok('Line one\nLine two'));

    await saveSelectionFromTab(deps, articleTab(), {}, { fallbackText: 'Line one Line two' });

    expect(memory.items.get('id-1')).toMatchObject({ text: 'Line one\nLine two' });
  });

  it('falls back to the reported text when the page cannot be read', async () => {
    const { memory, deps } = setup(err(BLOCKED));

    const result = await saveSelectionFromTab(deps, articleTab(), {}, { fallbackText: 'From PDF' });

    expect(result.ok && result.value.status).toBe('saved');
    expect(memory.items.get('id-1')).toMatchObject({ text: 'From PDF' });
  });

  it('explains why when the page cannot be read and no text was reported', async () => {
    const { deps } = setup(err(BLOCKED));

    expect(await saveSelectionFromTab(deps, articleTab())).toEqual({
      ok: false,
      error: { kind: 'page_access', message: 'This page is protected.' },
    });
  });

  it('never saves a password field selection, not even the text the browser reported', async () => {
    const sensitive: PageAccessError = { kind: 'sensitive', message: 'No passwords.' };
    const { memory, deps } = setup(err(sensitive));

    const result = await saveSelectionFromTab(deps, articleTab(), {}, { fallbackText: '••••' });

    expect(result).toEqual({ ok: false, error: { kind: 'page_access', message: 'No passwords.' } });
    expect(memory.saveCount()).toBe(0);
  });

  it('asks the user to select text when nothing is selected', async () => {
    const { deps } = setup(ok('  '));

    expect(await saveSelectionFromTab(deps, articleTab())).toMatchObject({
      ok: false,
      error: { kind: 'invalid', message: 'Select some text on the page first.' },
    });
  });

  it('does not touch the page when the tab cannot be saved', async () => {
    const { tabs, deps } = setup(ok('text'));

    const result = await saveSelectionFromTab(deps, articleTab({ url: 'about:addons' }));

    expect(result.ok).toBe(false);
    expect(tabs.selectionReads).toEqual([]);
  });
});
