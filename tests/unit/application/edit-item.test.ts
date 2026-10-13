import { describe, expect, it } from 'vitest';
import { deleteItem, updateItem, type EditDeps } from '@/application/edit-item';
import { createMemoryRepository, fixedClock } from '../support/fakes';
import { LATER, makeHighlight, makePage, NOW } from '../support/items';

const laterClock = { now: () => LATER };

function setup(clock = laterClock) {
  const memory = createMemoryRepository([makePage({ id: 'p' }), makeHighlight({ id: 'h' })]);
  const deps: EditDeps = { repository: memory.repository, clock };
  return { memory, deps };
}

describe('updateItem', () => {
  it('stores the new note and tags and records when the item changed', async () => {
    const { memory, deps } = setup();

    const result = await updateItem(deps, 'h', { note: ' Key point ', tags: ['Ideas', 'ideas'] });

    const expected = { ...makeHighlight({ id: 'h' }), note: 'Key point', tags: ['ideas'] };
    expect(result).toEqual({ ok: true, value: { ...expected, updatedAt: LATER } });
    expect(memory.items.get('h')).toEqual({ ...expected, updatedAt: LATER });
  });

  it('does not write when nothing changed', async () => {
    const { memory, deps } = setup(fixedClock);

    const result = await updateItem(deps, 'p', { note: '', tags: [] });

    expect(result).toEqual({ ok: true, value: makePage({ id: 'p' }) });
    expect(memory.saveCount()).toBe(0);
    expect(memory.items.get('p')?.updatedAt).toBe(NOW);
  });

  it('rejects invalid tags and keeps the stored item', async () => {
    const { memory, deps } = setup();

    const result = await updateItem(deps, 'p', { tags: ['x'.repeat(41)] });

    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid' } });
    expect(memory.items.get('p')).toEqual(makePage({ id: 'p' }));
  });

  it('reports an item that was deleted elsewhere', async () => {
    const { deps } = setup();

    expect(await updateItem(deps, 'gone', { note: 'x' })).toMatchObject({
      ok: false,
      error: { kind: 'not_found' },
    });
  });

  it('reports storage failures', async () => {
    const { memory, deps } = setup();
    memory.failWith({ kind: 'unavailable', message: 'No storage.' });

    expect(await updateItem(deps, 'p', { note: 'x' })).toEqual({
      ok: false,
      error: { kind: 'storage', message: 'No storage.' },
    });
  });
});

describe('deleteItem', () => {
  it('removes the item', async () => {
    const { memory, deps } = setup();

    expect(await deleteItem(deps, 'p')).toEqual({ ok: true, value: undefined });
    expect([...memory.items.keys()]).toEqual(['h']);
  });

  it('reports storage failures', async () => {
    const { memory, deps } = setup();
    memory.failWith({ kind: 'unknown', message: 'Disk error.' });

    expect(await deleteItem(deps, 'p')).toEqual({
      ok: false,
      error: { kind: 'storage', message: 'Disk error.' },
    });
  });
});
