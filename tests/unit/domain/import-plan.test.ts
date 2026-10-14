import { describe, expect, it } from 'vitest';
import { planImport } from '@/domain/import-plan';
import { sequentialIds } from '../support/fakes';
import { LATER, makeHighlight, makePage } from '../support/items';

const newId = () => sequentialIds().newId;

describe('planImport', () => {
  it('adds items that are not in the library yet, keeping their ids', () => {
    const page = makePage({ id: 'p' });
    const highlight = makeHighlight({ id: 'h' });

    const plan = planImport([], [page, highlight], 'keep-existing', newId());

    expect(plan.counts).toEqual({ added: 2, unchanged: 0, conflicts: 0, repeated: 0 });
    expect(plan.toWrite).toEqual([page, highlight]);
  });

  it('skips items already saved with the same content, even with other ids and dates', () => {
    const saved = makePage({ id: 'saved', tags: ['a', 'b'] });
    const exported = { ...saved, id: 'other', createdAt: LATER, updatedAt: LATER };

    const plan = planImport([saved], [exported], 'replace', newId());

    expect(plan.counts).toEqual({ added: 0, unchanged: 1, conflicts: 0, repeated: 0 });
    expect(plan.toWrite).toEqual([]);
  });

  it('matches pages by address, ignoring the #fragment', () => {
    const saved = makePage({ id: 'saved', url: 'https://example.com/article' });
    const incoming = makePage({ id: 'in', url: 'https://example.com/article#part-2' });

    const plan = planImport([saved], [incoming], 'keep-existing', newId());

    expect(plan.counts.conflicts).toBe(1);
    expect(plan.counts.added).toBe(0);
  });

  it('keeps the saved version of a conflicting item by default', () => {
    const saved = makePage({ id: 'saved', note: 'mine' });
    const incoming = makePage({ id: 'in', note: 'theirs' });

    const plan = planImport([saved], [incoming], 'keep-existing', newId());

    expect(plan.counts).toEqual({ added: 0, unchanged: 0, conflicts: 1, repeated: 0 });
    expect(plan.toWrite).toEqual([]);
  });

  it('replaces a conflicting item only when asked, keeping the saved id', () => {
    const saved = makeHighlight({ id: 'saved', tags: ['old'] });
    const incoming = makeHighlight({ id: 'in', tags: ['new'], updatedAt: LATER });

    const plan = planImport([saved], [incoming], 'replace', newId());

    expect(plan.counts.conflicts).toBe(1);
    expect(plan.toWrite).toEqual([{ ...incoming, id: 'saved' }]);
  });

  it('treats a highlight of other text on the same page as a new item', () => {
    const saved = makeHighlight({ id: 'h1', text: 'First sentence.' });
    const incoming = makeHighlight({ id: 'h2', text: 'Second sentence.' });

    const plan = planImport([saved], [incoming], 'keep-existing', newId());

    expect(plan.counts.added).toBe(1);
    expect(plan.toWrite).toEqual([incoming]);
  });

  it('uses only the first copy of an item repeated in the file', () => {
    const first = makePage({ id: 'a', note: 'first' });
    const second = makePage({ id: 'b', note: 'second' });

    const plan = planImport([], [first, second], 'replace', newId());

    expect(plan.counts).toEqual({ added: 1, unchanged: 0, conflicts: 0, repeated: 1 });
    expect(plan.toWrite).toEqual([first]);
  });

  it('gives a new item a fresh id when its id belongs to a different saved item', () => {
    const saved = makePage({ id: 'same', url: 'https://example.com/one' });
    const incoming = [
      makePage({ id: 'same', url: 'https://example.com/two' }),
      makePage({ id: 'unique', url: 'https://example.com/three' }),
      makePage({ id: 'unique', url: 'https://example.com/four' }),
    ];

    const plan = planImport([saved], incoming, 'keep-existing', newId());

    expect(plan.toWrite.map((item) => item.id)).toEqual(['id-1', 'unique', 'id-2']);
  });
});
