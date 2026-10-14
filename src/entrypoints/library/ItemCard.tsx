import { useEffect, useId, useRef, useState } from 'react';
import { deleteItem, updateItem } from '@/application/edit-item';
import { siteOfItem, type FacetCount } from '@/domain/library-query';
import type { ResearchItem } from '@/domain/research-item';
import { formatTagInput, parseTagInput } from '@/domain/tags';
import { useAppServices } from '@/ui/app-services-context';
import { TagSuggestions } from '@/ui/components/TagSuggestions';
import { formatDateTime } from '@/ui/format';

type Mode = 'view' | 'edit' | 'confirm-delete';

type ItemCardProps = {
  item: ResearchItem;
  /** True when the library was opened to show this item. */
  isTarget: boolean;
  tagSuggestions: readonly FacetCount[];
  onTagSelect: (tag: string) => void;
  onDeleted: (item: ResearchItem) => void;
};

export function ItemCard({
  item,
  isTarget,
  tagSuggestions,
  onTagSelect,
  onDeleted,
}: ItemCardProps) {
  const services = useAppServices();
  const titleId = useId();
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  // The button that opened the editor or the delete question gets focus back when
  // it closes, so keyboard users keep their place. It is not rendered until then.
  const returnFocusTo = useRef<'edit' | 'delete' | null>(null);
  const kindLabel = item.kind === 'page' ? 'Page' : 'Highlight';
  const edited = Date.parse(item.updatedAt) > Date.parse(item.createdAt);

  useEffect(() => {
    if (!isTarget) return;
    articleRef.current?.scrollIntoView({ block: 'center' });
    articleRef.current?.focus({ preventScroll: true });
  }, [isTarget]);

  useEffect(() => {
    if (mode !== 'view' || returnFocusTo.current === null) return;
    const button = returnFocusTo.current === 'edit' ? editButtonRef : deleteButtonRef;
    button.current?.focus();
    returnFocusTo.current = null;
  }, [mode]);

  const backToView = (focus: 'edit' | 'delete') => {
    returnFocusTo.current = focus;
    setMode('view');
  };

  async function confirmDelete(): Promise<void> {
    setBusy(true);
    const result = await deleteItem(services, item.id);
    // On success the item disappears from the list, so this card unmounts.
    if (result.ok) {
      onDeleted(item);
    } else {
      setBusy(false);
      setError(result.error.message);
    }
  }

  return (
    <li
      className={isTarget ? 'item item--target' : 'item'}
      data-testid="library-item"
      data-kind={item.kind}
      data-target={isTarget || undefined}
    >
      <article aria-labelledby={titleId} ref={articleRef} tabIndex={isTarget ? -1 : undefined}>
        <p className="item__meta">
          <span className={`item__kind item__kind--${item.kind}`}>{kindLabel}</span>
          <span data-testid="item-site">{siteOfItem(item)}</span>
          <span>
            Saved <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
          </span>
          {edited && (
            <span data-testid="item-edited">
              Edited <time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time>
            </span>
          )}
        </p>
        <h2 className="item__title" id={titleId}>
          <a href={item.url} target="_blank" rel="noopener noreferrer" data-testid="item-title">
            {item.pageTitle}
          </a>
        </h2>
        {item.kind === 'highlight' && (
          <blockquote className="item__quote" data-testid="item-text">
            {item.text}
          </blockquote>
        )}

        {mode === 'edit' ? (
          <ItemEditor
            item={item}
            tagSuggestions={tagSuggestions}
            onDone={() => {
              backToView('edit');
            }}
          />
        ) : (
          <>
            {item.note !== '' && (
              <p className="item__note" data-testid="item-note">
                {item.note}
              </p>
            )}
            {item.tags.length > 0 && (
              <ul className="item__tags" aria-label="Tags">
                {item.tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      className="tag"
                      title={`Show only items tagged "${tag}"`}
                      onClick={() => {
                        onTagSelect(tag);
                      }}
                    >
                      #{tag}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {mode === 'view' && (
          <div className="item__actions">
            <button
              ref={editButtonRef}
              type="button"
              className="button"
              onClick={() => {
                setError(null);
                setMode('edit');
              }}
            >
              Edit note and tags
            </button>
            <button
              ref={deleteButtonRef}
              type="button"
              className="button"
              onClick={() => {
                setError(null);
                setMode('confirm-delete');
              }}
            >
              Delete
            </button>
          </div>
        )}

        {mode === 'confirm-delete' && (
          <div className="item__actions item__confirm" role="group" aria-label="Confirm delete">
            <span>Delete this {kindLabel.toLowerCase()} permanently?</span>
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              Delete permanently
            </button>
            <button
              type="button"
              className="button"
              autoFocus
              disabled={busy}
              onClick={() => {
                backToView('delete');
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {error !== null && (
          <p className="message message--error" role="alert">
            {error}
          </p>
        )}
      </article>
    </li>
  );
}

type ItemEditorProps = {
  item: ResearchItem;
  tagSuggestions: readonly FacetCount[];
  onDone: () => void;
};

function ItemEditor({ item, tagSuggestions, onDone }: ItemEditorProps) {
  const services = useAppServices();
  const [note, setNote] = useState(item.note);
  const [tagsText, setTagsText] = useState(formatTagInput(item.tags));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await updateItem(services, item.id, { note, tags: parseTagInput(tagsText) });
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error.message);
  }

  return (
    <form
      className="item__editor"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onDone();
        }
      }}
    >
      <label className="field">
        <span className="field__label">Note</span>
        <textarea
          className="field__input"
          name="note"
          rows={4}
          autoFocus
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="field__label">Tags (separated by commas)</span>
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
      <TagSuggestions tags={tagSuggestions} value={tagsText} onChange={setTagsText} />
      {error !== null && (
        <p className="message message--error" role="alert">
          {error}
        </p>
      )}
      <div className="item__actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          Save changes
        </button>
        <button type="button" className="button" disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
