import { useMemo, useState } from 'react';
import {
  EMPTY_QUERY,
  isFiltered,
  libraryFacets,
  queryLibrary,
  type LibraryQuery,
} from '@/domain/library-query';
import type { ResearchItem } from '@/domain/research-item';
import { plural } from '@/ui/format';
import { useLibraryItems } from '@/ui/hooks/use-library-items';
import { ItemCard } from './ItemCard';
import { Toolbar } from './Toolbar';

const NO_ITEMS: readonly ResearchItem[] = [];

export function App() {
  const library = useLibraryItems();
  const [query, setQuery] = useState<LibraryQuery>(EMPTY_QUERY);

  const items = library.status === 'ready' ? library.value.items : NO_ITEMS;
  const results = useMemo(() => queryLibrary(items, query), [items, query]);
  const facets = useMemo(() => libraryFacets(items), [items]);
  const clearFilters = () => {
    setQuery({ ...EMPTY_QUERY, sort: query.sort });
  };

  return (
    <main className="library">
      <header className="library__header">
        <h1 className="library__title">Recall library</h1>
        {library.status === 'ready' && (
          <p className="library__muted" data-testid="library-count">
            {describeCounts(library.value.items)}
          </p>
        )}
      </header>

      {library.status === 'loading' && <p className="library__muted">Loading…</p>}
      {library.status === 'error' && (
        <p className="message message--error" role="alert">
          {library.message}
        </p>
      )}
      {library.status === 'ready' && library.value.skippedCount > 0 && (
        <p className="message message--info" data-testid="skipped-notice">
          {plural(library.value.skippedCount, 'saved item')} could not be read and{' '}
          {library.value.skippedCount === 1 ? 'is' : 'are'} not shown. Recall leaves{' '}
          {library.value.skippedCount === 1 ? 'it' : 'them'} untouched in storage.
        </p>
      )}

      {library.status === 'ready' && items.length === 0 && (
        <section className="library__empty" data-testid="empty-library">
          <h2>Your library is empty</h2>
          <p>
            To save the page you are reading, click the Recall button in the toolbar or right-click
            the page and choose <strong>Save page to Recall</strong>. To save a highlight, select
            text first. The default keyboard shortcuts are <kbd>Alt+Shift+S</kbd> (save page) and{' '}
            <kbd>Alt+Shift+H</kbd> (save selection).
          </p>
        </section>
      )}

      {items.length > 0 && (
        <>
          <Toolbar query={query} facets={facets} onChange={setQuery} onClear={clearFilters} />
          <p className="library__muted" aria-live="polite" data-testid="result-count">
            {isFiltered(query)
              ? `${plural(results.length, 'match', 'matches')} out of ${plural(items.length, 'item')}`
              : `Showing all ${plural(items.length, 'item')}`}
          </p>
          {results.length === 0 ? (
            <section className="library__empty" data-testid="no-results">
              <h2>No matching items</h2>
              <p>Nothing in your library matches this search and these filters.</p>
              <button type="button" className="button" onClick={clearFilters}>
                Clear search and filters
              </button>
            </section>
          ) : (
            <ul className="library__items">
              {results.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onTagSelect={(tag) => {
                    setQuery({ ...query, tag });
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function describeCounts(items: readonly ResearchItem[]): string {
  const pages = items.filter((item) => item.kind === 'page').length;
  return `${plural(items.length, 'item')}: ${plural(pages, 'page')}, ${plural(items.length - pages, 'highlight')}`;
}
