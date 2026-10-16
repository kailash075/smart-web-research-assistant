import { describe, expect, it } from 'vitest';
import {
  applyImport,
  checkImportSize,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ITEMS,
  previewImport,
  readImportFile,
  type ImportDeps,
  type ImportFile,
} from '@/application/import-library';
import type { ResearchItem } from '@/domain/research-item';
import { createMemoryRepository, sequentialIds } from '../support/fakes';
import { makeHighlight, makePage } from '../support/items';

function exportText(items: unknown[], envelope: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'pagenest-export', version: 1, items, ...envelope });
}

function readOk(text: string): ImportFile {
  const result = readImportFile(text);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function setup(saved: readonly ResearchItem[] = []) {
  const memory = createMemoryRepository(saved);
  const deps: ImportDeps = { repository: memory.repository, ids: sequentialIds() };
  return { memory, deps };
}

describe('checkImportSize', () => {
  it('accepts files up to the limit and refuses larger ones', () => {
    expect(checkImportSize(MAX_IMPORT_BYTES).ok).toBe(true);
    expect(checkImportSize(MAX_IMPORT_BYTES + 1)).toEqual({
      ok: false,
      error: {
        kind: 'invalid_file',
        message: 'This file is too large to import (the limit is 25 MB).',
      },
    });
  });
});

describe('readImportFile', () => {
  it('reads the items of a PageNest export file', () => {
    const items = [makePage(), makeHighlight()];

    expect(readImportFile(exportText(items))).toEqual({
      ok: true,
      value: { items, invalidCount: 0, problems: [] },
    });
  });

  it.each(['clipwise-export', 'recall-export'])(
    'reads files exported under an earlier name (%s)',
    (format) => {
      const items = [makePage()];

      expect(readImportFile(exportText(items, { format }))).toEqual({
        ok: true,
        value: { items, invalidCount: 0, problems: [] },
      });
    },
  );

  it.each([
    ['text that is not JSON', 'not json {', 'This file is not valid JSON.'],
    ['an empty file', '', 'This file is not valid JSON.'],
    ['a JSON array', '[]', 'This is not a PageNest export file.'],
    ['JSON from another app', '{"bookmarks": []}', 'This is not a PageNest export file.'],
    [
      'a file from a newer version',
      exportText([], { version: 2, items: 'a new shape' }),
      'This file was exported by a newer version of PageNest.',
    ],
    [
      'a file without items',
      '{"format": "pagenest-export", "version": 1}',
      'This PageNest export file is damaged and cannot be imported.',
    ],
    [
      'a file with a broken version',
      exportText([], { version: 'one' }),
      'This PageNest export file is damaged and cannot be imported.',
    ],
  ])('refuses %s', (_label, text, message) => {
    const result = readImportFile(text);
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_file' } });
    expect(!result.ok && result.error.message).toContain(message);
  });

  it('refuses files with more items than it can import at once', () => {
    const text = exportText(Array.from({ length: MAX_IMPORT_ITEMS + 1 }, () => 0));
    expect(readImportFile(text)).toMatchObject({
      ok: false,
      error: { kind: 'invalid_file', message: expect.stringContaining('50,000') as unknown },
    });
  });

  it('skips invalid entries and explains the first few', () => {
    const good = makePage();
    const entries = [
      good,
      { ...makePage({ id: 'bad-url' }), url: 'javascript:alert(1)' },
      'not an item',
      ...Array.from({ length: 5 }, (_, index) => ({
        ...makeHighlight(),
        id: `h${String(index)}`,
        text: '',
      })),
    ];

    const file = readOk(exportText(entries));

    expect(file.items).toEqual([good]);
    expect(file.invalidCount).toBe(7);
    expect(file.problems).toHaveLength(5);
    expect(file.problems[0]).toMatch(/^Item 2: url: /);
    expect(file.problems[1]).toMatch(/^Item 3: /);
    expect(file.problems[2]).toMatch(/^Item 4: text: /);
  });
});

describe('previewImport', () => {
  it('counts what an import would do without writing anything', async () => {
    const saved = makePage({ id: 'p', note: 'mine' });
    const { memory, deps } = setup([saved]);
    const file = readOk(
      exportText([
        { ...saved, note: 'theirs' },
        makeHighlight({ id: 'h' }),
        makeHighlight({ id: 'h-copy' }),
        { broken: true },
      ]),
    );

    expect(await previewImport(deps, file, 'keep-existing')).toEqual({
      ok: true,
      value: { added: 1, unchanged: 0, conflicts: 1, repeated: 1, replaced: 0, invalid: 1 },
    });
    expect(memory.saveCount()).toBe(0);
  });
});

describe('applyImport', () => {
  it('adds new items in a single write and keeps saved versions by default', async () => {
    const saved = makePage({ id: 'p', note: 'mine' });
    const { memory, deps } = setup([saved]);
    const highlight = makeHighlight({ id: 'h' });
    const file = readOk(exportText([{ ...saved, note: 'theirs' }, highlight]));

    const result = await applyImport(deps, file, 'keep-existing');

    expect(result).toEqual({
      ok: true,
      value: { added: 1, unchanged: 0, conflicts: 1, repeated: 0, replaced: 0, invalid: 0 },
    });
    expect(memory.saveCount()).toBe(1);
    expect([...memory.items.values()]).toEqual([saved, highlight]);
  });

  it('replaces conflicting items when the user chose to', async () => {
    const saved = makePage({ id: 'p', note: 'mine' });
    const { memory, deps } = setup([saved]);
    const file = readOk(exportText([{ ...saved, id: 'other', note: 'theirs' }]));

    const result = await applyImport(deps, file, 'replace');

    expect(result).toMatchObject({ ok: true, value: { conflicts: 1, replaced: 1 } });
    expect(memory.items.get('p')?.note).toBe('theirs');
    expect(memory.items.has('other')).toBe(false);
  });

  it('plans again against the library as it is when the user confirms', async () => {
    const { memory, deps } = setup();
    const page = makePage({ id: 'p' });
    const file = readOk(exportText([page]));
    await memory.repository.save(page);

    const result = await applyImport(deps, file, 'keep-existing');

    expect(result).toMatchObject({ ok: true, value: { added: 0, unchanged: 1 } });
  });

  it('reports storage failures', async () => {
    const { memory, deps } = setup();
    const file = readOk(exportText([makePage()]));
    memory.failWith({ kind: 'quota_exceeded', message: 'Storage is full.' });

    expect(await applyImport(deps, file, 'keep-existing')).toEqual({
      ok: false,
      error: { kind: 'storage', message: 'Storage is full.' },
    });
  });
});
