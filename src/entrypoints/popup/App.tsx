import { browser } from 'wxt/browser';
import { useLibrarySummary, type LibrarySummaryState } from '@/ui/hooks/use-library-summary';

export function App() {
  const { name, version } = browser.runtime.getManifest();
  const library = useLibrarySummary();

  return (
    <main className="popup">
      <h1 className="popup__title">{name}</h1>
      <p className="popup__text">Saving features arrive in the next phase.</p>
      <dl className="popup__meta">
        <dt>Saved</dt>
        <dd data-testid="library-summary">{describeLibrary(library)}</dd>
        <dt>Version</dt>
        <dd>{version}</dd>
        <dt>Build</dt>
        <dd>
          {import.meta.env.BROWSER} · MV{import.meta.env.MANIFEST_VERSION}
        </dd>
      </dl>
      {library.status === 'error' && (
        <p className="popup__error" role="alert">
          {library.message}
        </p>
      )}
    </main>
  );
}

function describeLibrary(state: LibrarySummaryState): string {
  if (state.status === 'loading') return 'Loading…';
  if (state.status === 'error') return 'Unavailable';
  const { total, pages, highlights, skipped } = state.summary;
  const counts = `${plural(total, 'item')} (${plural(pages, 'page')}, ${plural(highlights, 'highlight')})`;
  return skipped > 0 ? `${counts}, ${plural(skipped, 'unreadable item')} skipped` : counts;
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
