import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { LibrarySummary } from '@/application/get-library-summary';
import type { AppError } from '@/application/errors';
import type { BrowserTab } from '@/application/ports';
import {
  pageFromTab,
  savePageFromTab,
  saveSelectionFromTab,
  type SaveablePage,
  type SaveExtras,
} from '@/application/save-from-tab';
import type { SaveOutcome } from '@/application/save-item';
import { parseTagInput } from '@/domain/tags';
import { siteOf } from '@/domain/url';
import type { Result } from '@/shared/result';
import { useAppServices } from '@/ui/app-services-context';
import { formatDate, plural } from '@/ui/format';
import { useActiveTab } from '@/ui/hooks/use-active-tab';
import { useLibrarySummary } from '@/ui/hooks/use-library-summary';
import type { LoadState } from '@/ui/hooks/use-repository-data';
import { useSavedPage } from '@/ui/hooks/use-saved-page';
import { openLibrary } from '@/ui/navigation';

type Feedback = { tone: 'success' | 'info' | 'error'; message: string };

export function App() {
  const { name, version } = browser.runtime.getManifest();
  const tab = useActiveTab();
  const library = useLibrarySummary();

  return (
    <main className="popup">
      <header className="popup__header">
        <h1 className="popup__title">{name}</h1>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => {
            void openLibrary().then(() => {
              window.close();
            });
          }}
        >
          Open library
        </button>
      </header>

      {tab.status === 'loading' && <p className="popup__muted">Loading…</p>}
      {tab.status === 'error' && (
        <p className="message message--error" role="alert">
          {tab.message}
        </p>
      )}
      {tab.status === 'ready' && <CurrentTab tab={tab.value} />}

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
        <p className="message message--error" role="alert">
          {library.message}
        </p>
      )}
    </main>
  );
}

function CurrentTab({ tab }: { tab: BrowserTab }) {
  const page = pageFromTab(tab);
  if (!page.ok) {
    return (
      <p className="message message--info" data-testid="page-status">
        {page.error.message}
      </p>
    );
  }
  return <SaveForm tab={tab} page={page.value} />;
}

function SaveForm({ tab, page }: { tab: BrowserTab; page: SaveablePage }) {
  const services = useAppServices();
  const savedPage = useSavedPage(page.url);
  const [note, setNote] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const site = siteOf(new URL(page.url));
  const existing = savedPage.status === 'ready' ? savedPage.value : undefined;

  async function save(
    action: (extras: SaveExtras) => Promise<Result<SaveOutcome, AppError>>,
  ): Promise<void> {
    setBusy(true);
    setFeedback(null);
    const result = await action({ note, tags: parseTagInput(tagsText) });
    setBusy(false);
    setFeedback(describeSave(result));
    if (result.ok && result.value.status === 'saved') {
      setNote('');
      setTagsText('');
    }
  }

  return (
    <>
      <section className="popup__page" aria-label="Current page">
        <p className="popup__page-title" data-testid="page-title">
          {page.title.trim() === '' ? site : page.title}
        </p>
        <p className="popup__muted" data-testid="page-status">
          {site}
          {existing && ` · Saved ${formatDate(existing.createdAt)}`}
        </p>
      </section>

      <form
        className="popup__form"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="field">
          <span className="field__label">Note (optional)</span>
          <textarea
            className="field__input"
            name="note"
            rows={3}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span className="field__label">Tags (optional, separated by commas)</span>
          <input
            className="field__input"
            name="tags"
            type="text"
            value={tagsText}
            onChange={(event) => {
              setTagsText(event.target.value);
            }}
          />
        </label>
        <div className="popup__actions">
          <button
            type="button"
            className="button button--primary"
            data-testid="save-page"
            disabled={busy || existing !== undefined}
            onClick={() => void save((extras) => savePageFromTab(services, tab, extras))}
          >
            {existing ? 'Page already saved' : 'Save page'}
          </button>
          <button
            type="button"
            className="button"
            data-testid="save-selection"
            disabled={busy}
            onClick={() => void save((extras) => saveSelectionFromTab(services, tab, extras))}
          >
            Save selection
          </button>
        </div>
      </form>

      {/* Kept in the page while empty so screen readers announce new messages. */}
      <div aria-live="polite" data-testid="save-feedback">
        {feedback && (
          <p
            className={`message message--${feedback.tone}`}
            role={feedback.tone === 'error' ? 'alert' : undefined}
          >
            {feedback.message}
          </p>
        )}
      </div>
    </>
  );
}

function describeSave(result: Result<SaveOutcome, AppError>): Feedback {
  if (!result.ok) return { tone: 'error', message: result.error.message };
  const { status, item } = result.value;
  const what = item.kind === 'page' ? 'Page' : 'Highlight';
  return status === 'saved'
    ? { tone: 'success', message: `${what} saved.` }
    : {
        tone: 'info',
        message: `${what} was already saved on ${formatDate(item.createdAt)}. Nothing was changed.`,
      };
}

function describeLibrary(state: LoadState<LibrarySummary>): string {
  if (state.status === 'loading') return 'Loading…';
  if (state.status === 'error') return 'Unavailable';
  const { total, pages, highlights, skipped } = state.value;
  const counts = `${plural(total, 'item')} (${plural(pages, 'page')}, ${plural(highlights, 'highlight')})`;
  return skipped > 0 ? `${counts}, ${plural(skipped, 'unreadable item')} skipped` : counts;
}
