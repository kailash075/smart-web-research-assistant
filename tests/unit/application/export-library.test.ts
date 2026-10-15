import { describe, expect, it } from 'vitest';
import { exportLibrary } from '@/application/export-library';
import { readImportFile } from '@/application/import-library';
import { createMemoryRepository, fixedClock } from '../support/fakes';
import { LATER, makeHighlight, makePage, NOW } from '../support/items';

describe('exportLibrary', () => {
  it('writes every item, oldest first, in a versioned file', async () => {
    const newer = makeHighlight({ id: 'h', createdAt: LATER, updatedAt: LATER });
    const older = makePage({ id: 'p', tags: ['research'] });
    const memory = createMemoryRepository([newer, older]);

    const result = await exportLibrary({ repository: memory.repository, clock: fixedClock });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.itemCount).toBe(2);
    expect(result.value.skippedCount).toBe(0);
    expect(result.value.filename).toMatch(/^clipwise-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.value.json.endsWith('\n')).toBe(true);
    expect(JSON.parse(result.value.json)).toEqual({
      format: 'clipwise-export',
      version: 1,
      exportedAt: NOW,
      items: [older, newer],
    });
  });

  it('names the file after the local date', async () => {
    const now = new Date(2026, 0, 5, 23, 30).toISOString();
    const memory = createMemoryRepository();

    const result = await exportLibrary({
      repository: memory.repository,
      clock: { now: () => now },
    });

    expect(result.ok && result.value.filename).toBe('clipwise-export-2026-01-05.json');
  });

  it('produces a file that imports back unchanged', async () => {
    const items = [
      makePage({ id: 'p', note: 'A note' }),
      makeHighlight({ id: 'h', createdAt: LATER, updatedAt: LATER }),
    ];
    const memory = createMemoryRepository(items);

    const exported = await exportLibrary({ repository: memory.repository, clock: fixedClock });
    if (!exported.ok) throw new Error('export failed');

    expect(readImportFile(exported.value.json)).toEqual({
      ok: true,
      value: { items, invalidCount: 0, problems: [] },
    });
  });

  it('reports storage failures', async () => {
    const memory = createMemoryRepository();
    memory.failWith({ kind: 'unavailable', message: 'No storage.' });

    expect(await exportLibrary({ repository: memory.repository, clock: fixedClock })).toEqual({
      ok: false,
      error: { kind: 'storage', message: 'No storage.' },
    });
  });
});
