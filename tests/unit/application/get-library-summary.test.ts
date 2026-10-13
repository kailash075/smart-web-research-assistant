import { describe, expect, it } from 'vitest';
import { getLibrarySummary } from '@/application/get-library-summary';
import type { ResearchRepository, StorageError, StoredItems } from '@/application/ports';
import { err, ok, type Result } from '@/shared/result';
import { makeHighlight, makePage } from '../support/items';

describe('getLibrarySummary', () => {
  it('counts pages, highlights, and skipped records', async () => {
    const repository = repositoryReturning(
      ok({
        items: [makePage({ id: 'a' }), makeHighlight({ id: 'b' }), makeHighlight({ id: 'c' })],
        skippedCount: 1,
      }),
    );

    expect(await getLibrarySummary(repository)).toEqual({
      ok: true,
      value: { total: 3, pages: 1, highlights: 2, skipped: 1 },
    });
  });

  it('passes storage errors through unchanged', async () => {
    const error: StorageError = { kind: 'unavailable', message: 'No storage' };
    expect(await getLibrarySummary(repositoryReturning(err(error)))).toEqual({ ok: false, error });
  });
});

function repositoryReturning(result: Result<StoredItems, StorageError>): ResearchRepository {
  const unused = () => Promise.reject(new Error('not used in this test'));
  return {
    list: () => Promise.resolve(result),
    get: unused,
    save: unused,
    delete: unused,
    subscribe: () => () => undefined,
  };
}
