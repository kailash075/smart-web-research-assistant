import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { exportLibrary } from '@/application/export-library';
import { checkImportSize, readImportFile } from '@/application/import-library';
import {
  EMPTY_QUERY,
  isFiltered,
  libraryFacets,
  queryLibrary,
  type LibraryQuery,
} from '@/domain/library-query';
import type { ResearchItem } from '@/domain/research-item';
import { useAppServices } from '@/ui/app-services-context';
import { downloadTextFile } from '@/ui/download';
import { plural } from '@/ui/format';
import { useLibraryItems } from '@/ui/hooks/use-library-items';
import { LIBRARY_ITEM_PARAM } from '@/ui/navigation';
import { ImportPanel, type PendingImport } from './ImportPanel';
import { ItemCard } from './ItemCard';
import { Toolbar } from './Toolbar';

const NO_ITEMS: readonly ResearchItem[] = [];

type Notice = { tone: 'success' | 'info' | 'error'; message: string };

export function App() {
  const services = useAppServices();
  const library = useLibraryItems();
  const [query, setQuery] = useState<LibraryQuery>(EMPTY_QUERY);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  // Set when the popup's "Show in library" opened this page.
  const [targetId] = useState(() => new URLSearchParams(location.search).get(LIBRARY_ITEM_PARAM));
  const noticeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const items = library.status === 'ready' ? library.value.items : NO_ITEMS;
  const results = useMemo(() => queryLibrary(items, query), [items, query]);
  const facets = useMemo(() => libraryFacets(items), [items]);
  const targetMissing =
    targetId !== null && library.status === 'ready' && !items.some(({ id }) => id === targetId);

  useFocusSearchOnSlash(searchRef);

  const clearFilters = () => {
    setQuery({ ...EMPTY_QUERY, sort: query.sort });
  };

  // Messages that follow an action also take focus, so keyboard and screen reader
  // users land somewhere sensible (for example after the focused item was deleted).
  const announce = (next: Notice, moveFocus = false) => {
    setNotice(next);
    if (moveFocus) noticeRef.current?.focus();
  };

  async function exportItems(): Promise<void> {
    const result = await exportLibrary(services);
    if (!result.ok) {
      announce({ tone: 'error', message: result.error.message });
      return;
    }
    const { filename, json, itemCount, skippedCount } = result.value;
    downloadTextFile(filename, json, 'application/json');
    const skipped =
      skippedCount > 0 ? ` ${plural(skippedCount, 'unreadable item')} could not be included.` : '';
    announce({
      tone: 'success',
      message: `Exported ${plural(itemCount, 'item')} to ${filename}.${skipped}`,
    });
  }

  async function chooseImportFile(file: File): Promise<void> {
    setNotice(null);
    setPendingImport(null);
    const fail = (message: string) => {
      announce({ tone: 'error', message: `Could not import ${file.name}. ${message}` });
    };
    const size = checkImportSize(file.size);
    if (!size.ok) {
      fail(size.error.message);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      fail('The file could not be read.');
      return;
    }
    const parsed = readImportFile(text);
    if (parsed.ok) setPendingImport({ fileName: file.name, file: parsed.value });
    else fail(parsed.error.message);
  }

  return (
    <main className="library">
      <header className="library__header">
        <div>
          <h1 className="library__title">Recall library</h1>
          {library.status === 'ready' && (
            <p className="library__muted" data-testid="library-count">
              {describeCounts(library.value.items)}
            </p>
          )}
        </div>
        <div className="library__backup">
          <label className="button">
            Import…
            <input
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              data-testid="import-file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Lets the user choose the same file again after fixing it.
                event.target.value = '';
                if (file) void chooseImportFile(file);
              }}
            />
          </label>
          <button
            type="button"
            className="button"
            disabled={items.length === 0}
            onClick={() => void exportItems()}
          >
            Export
          </button>
        </div>
      </header>

      <div
        ref={noticeRef}
        className="library__notice"
        tabIndex={-1}
        aria-live="polite"
        data-testid="library-notice"
      >
        {notice && (
          <p
            className={`message message--${notice.tone}`}
            role={notice.tone === 'error' ? 'alert' : undefined}
          >
            {notice.message}{' '}
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                setNotice(null);
              }}
            >
              Dismiss
            </button>
          </p>
        )}
      </div>

      {pendingImport && (
        <ImportPanel
          pending={pendingImport}
          onFinish={(summary) => {
            setPendingImport(null);
            if (summary !== null) announce({ tone: 'success', message: summary }, true);
          }}
        />
      )}

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
      {targetMissing && (
        <p className="message message--info" data-testid="target-missing">
          The item you opened is no longer in your library.
        </p>
      )}

      {library.status === 'ready' && items.length === 0 && (
        <section className="library__empty" data-testid="empty-library">
          <h2>Your library is empty</h2>
          <p>
            To save the page you are reading, click the Recall button in the toolbar or right-click
            the page and choose <strong>Save page to Recall</strong>. To save a highlight, select
            text first. The default keyboard shortcuts are <kbd>Alt+Shift+S</kbd> (save page) and{' '}
            <kbd>Alt+Shift+H</kbd> (save selection). You can also import a backup file.
          </p>
        </section>
      )}

      {items.length > 0 && (
        <>
          <Toolbar
            query={query}
            facets={facets}
            searchRef={searchRef}
            onChange={setQuery}
            onClear={clearFilters}
          />
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
                  isTarget={item.id === targetId}
                  tagSuggestions={facets.tags}
                  onTagSelect={(tag) => {
                    setQuery({ ...query, tag });
                  }}
                  onDeleted={(deleted) => {
                    announce({ tone: 'info', message: `Deleted "${deleted.pageTitle}".` }, true);
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

/** Pressing "/" outside a text field jumps to the search box, as on many sites. */
function useFocusSearchOnSlash(searchRef: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntry(event.target)) return;
      if (!searchRef.current) return;
      event.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [searchRef]);
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function describeCounts(items: readonly ResearchItem[]): string {
  const pages = items.filter((item) => item.kind === 'page').length;
  return `${plural(items.length, 'item')}: ${plural(pages, 'page')}, ${plural(items.length - pages, 'highlight')}`;
}
