import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ResearchRepository } from '@/application/ports';
import {
  createBrowserStorageResearchRepository,
  SCHEMA_VERSION_KEY,
} from '@/infrastructure/storage/browser-storage-research-repository';
import { getLocalStorageArea, type StorageAreaLike } from '@/infrastructure/storage/storage-area';
import { makeHighlight, makePage } from '../support/items';

// These tests run against WXT's in-memory fake of browser.storage.local.
describe('browser storage research repository', () => {
  let repository: ResearchRepository;

  beforeEach(() => {
    fakeBrowser.reset();
    repository = createBrowserStorageResearchRepository(getLocalStorageArea());
  });

  it('starts empty and records the storage format version', async () => {
    expect(await repository.list()).toEqual({ ok: true, value: { items: [], skippedCount: 0 } });
    expect(await browser.storage.local.get(SCHEMA_VERSION_KEY)).toEqual({
      [SCHEMA_VERSION_KEY]: 1,
    });
  });

  it('saves, reads, lists, and deletes items', async () => {
    const page = makePage({ id: 'p1' });
    const highlight = makeHighlight({ id: 'h1', tags: ['quotes'] });

    expect(await repository.save(page)).toEqual({ ok: true, value: undefined });
    expect(await repository.save(highlight)).toEqual({ ok: true, value: undefined });

    expect(await repository.get('h1')).toEqual({ ok: true, value: highlight });
    const listed = await repository.list();
    expect(listed.ok && listed.value.items).toHaveLength(2);
    expect(listed.ok && listed.value.items).toEqual(expect.arrayContaining([page, highlight]));

    await repository.delete('p1');
    expect(await repository.get('p1')).toEqual({ ok: true, value: undefined });
    const afterDelete = await repository.list();
    expect(afterDelete.ok && afterDelete.value.items).toEqual([highlight]);
  });

  it('stores one key per item so separate edits do not overwrite each other', async () => {
    await repository.save(makePage({ id: 'p1' }));
    await repository.save(makePage({ id: 'p2', url: 'https://example.com/other' }));

    const keys = Object.keys(await browser.storage.local.get(null));
    expect(keys.sort()).toEqual(['item:p1', 'item:p2', SCHEMA_VERSION_KEY]);
  });

  it('replaces an item saved again with the same id', async () => {
    await repository.save(makePage({ id: 'p1', note: 'first' }));
    await repository.save(makePage({ id: 'p1', note: 'second' }));

    const listed = await repository.list();
    expect(listed.ok && listed.value.items.map((item) => item.note)).toEqual(['second']);
  });

  it('refuses to write an invalid item', async () => {
    const result = await repository.save(makePage({ url: 'javascript:alert(1)' }));

    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_data' } });
    expect(await browser.storage.local.get('item:page-1')).toEqual({});
  });

  it('skips damaged records instead of failing the whole library', async () => {
    await repository.save(makePage({ id: 'good' }));
    await browser.storage.local.set({
      'item:garbage': { hello: 'world' },
      'item:wrong-key': makePage({ id: 'different-id' }),
      unrelated: 'ignored',
    });

    const listed = await repository.list();

    expect(listed).toEqual({
      ok: true,
      value: { items: [makePage({ id: 'good' })], skippedCount: 2 },
    });
    expect(await repository.get('garbage')).toMatchObject({
      ok: false,
      error: { kind: 'invalid_data' },
    });
  });

  it('refuses to read or write data from a newer version of the extension', async () => {
    await browser.storage.local.set({ [SCHEMA_VERSION_KEY]: 2, 'item:p1': makePage({ id: 'p1' }) });

    expect(await repository.list()).toMatchObject({ ok: false, error: { kind: 'newer_schema' } });
    expect(await repository.save(makePage({ id: 'p2' }))).toMatchObject({
      ok: false,
      error: { kind: 'newer_schema' },
    });
    expect(await browser.storage.local.get('item:p2')).toEqual({});
  });

  it('rejects an unrecognised format marker', async () => {
    await browser.storage.local.set({ [SCHEMA_VERSION_KEY]: 'v1' });
    expect(await repository.list()).toMatchObject({ ok: false, error: { kind: 'invalid_data' } });
  });

  it('notifies subscribers when items change, and stops after unsubscribing', async () => {
    const listener = vi.fn();
    const unsubscribe = repository.subscribe(listener);

    await repository.save(makePage({ id: 'p1' }));
    expect(listener).toHaveBeenCalledTimes(1);

    await browser.storage.local.set({ 'meta:other': true });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await repository.delete('p1');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('browser storage research repository failures', () => {
  it('reports that storage is unavailable', async () => {
    const repository = createBrowserStorageResearchRepository(undefined);

    expect(await repository.list()).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
    expect(await repository.save(makePage())).toMatchObject({
      ok: false,
      error: { kind: 'unavailable' },
    });
    expect(repository.subscribe(vi.fn())).toBeTypeOf('function');
  });

  it('turns a full storage quota into a quota_exceeded error', async () => {
    const repository = createBrowserStorageResearchRepository(
      failingArea({ set: new Error('QUOTA_BYTES quota exceeded') }),
    );
    expect(await repository.save(makePage())).toMatchObject({
      ok: false,
      error: { kind: 'quota_exceeded' },
    });
  });

  it('turns unexpected storage errors into an unknown error with the cause', async () => {
    const repository = createBrowserStorageResearchRepository(
      failingArea({ get: new Error('IO error: disk unavailable') }),
    );
    const result = await repository.list();
    expect(result).toMatchObject({ ok: false, error: { kind: 'unknown' } });
    expect(!result.ok && result.error.message).toContain('disk unavailable');
  });

  it('retries the format check after a temporary failure', async () => {
    const get = vi
      .fn<StorageAreaLike['get']>()
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValue({});
    const repository = createBrowserStorageResearchRepository({ ...failingArea({}), get });

    expect((await repository.list()).ok).toBe(false);
    expect(await repository.list()).toEqual({ ok: true, value: { items: [], skippedCount: 0 } });
  });
});

function failingArea(errors: { get?: Error; set?: Error }): StorageAreaLike {
  return {
    get: (keys) =>
      errors.get ? Promise.reject(errors.get) : Promise.resolve(keys === null ? {} : {}),
    set: () => (errors.set ? Promise.reject(errors.set) : Promise.resolve()),
    remove: () => Promise.resolve(),
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  };
}
