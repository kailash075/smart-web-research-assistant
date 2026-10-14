import { useCallback, useId, useState } from 'react';
import {
  applyImport,
  previewImport,
  type ImportFile,
  type ImportSummary,
} from '@/application/import-library';
import type { ResearchRepository } from '@/application/ports';
import type { ConflictPolicy } from '@/domain/import-plan';
import { useAppServices } from '@/ui/app-services-context';
import { plural } from '@/ui/format';
import { useRepositoryData } from '@/ui/hooks/use-repository-data';

/** A file the user chose, already read and checked, waiting for confirmation. */
export type PendingImport = { fileName: string; file: ImportFile };

type ImportPanelProps = {
  pending: PendingImport;
  /** Called with a summary after importing, or null when the user cancels. */
  onFinish: (summary: string | null) => void;
};

/**
 * Shows what importing a file would change and asks before writing anything. Items
 * that differ from the saved version are kept as they are unless the user explicitly
 * chooses to replace them.
 */
export function ImportPanel({ pending, onFinish }: ImportPanelProps) {
  const services = useAppServices();
  const headingId = useId();
  const [policy, setPolicy] = useState<ConflictPolicy>('keep-existing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recomputed when the library changes, so the numbers stay true until confirmed.
  const loadPreview = useCallback(
    (repository: ResearchRepository) =>
      previewImport({ repository, ids: services.ids }, pending.file, policy),
    [services.ids, pending.file, policy],
  );
  const preview = useRepositoryData(loadPreview);
  const summary = preview.status === 'ready' ? preview.value : null;
  const toWrite = summary ? summary.added + summary.replaced : 0;

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await applyImport(services, pending.file, policy);
    setBusy(false);
    if (result.ok) onFinish(describeImport(result.value));
    else setError(result.error.message);
  }

  return (
    <section className="import-panel" aria-labelledby={headingId} data-testid="import-panel">
      <h2 className="import-panel__title" id={headingId}>
        Import from {pending.fileName}
      </h2>
      {preview.status === 'loading' && <p className="library__muted">Checking the file…</p>}
      {preview.status === 'error' && (
        <p className="message message--error" role="alert">
          {preview.message}
        </p>
      )}
      {summary && (
        <ul className="import-panel__summary" data-testid="import-summary">
          <li>{plural(summary.added, 'new item')} to add</li>
          {summary.unchanged > 0 && (
            <li>{plural(summary.unchanged, 'item')} already in your library, unchanged</li>
          )}
          {summary.conflicts > 0 && (
            <li>
              {plural(summary.conflicts, 'item')} already in your library with a different title,
              note, tags, or text
            </li>
          )}
          {summary.repeated > 0 && (
            <li>
              {plural(summary.repeated, 'item')} repeated in the file (only the first copy is used)
            </li>
          )}
          {summary.invalid > 0 && (
            <li>
              {plural(summary.invalid, 'entry', 'entries')} that cannot be read and will be skipped
              <details>
                <summary>Why</summary>
                <ul>
                  {pending.file.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </details>
            </li>
          )}
        </ul>
      )}

      {summary && summary.conflicts > 0 && (
        <fieldset className="import-panel__policy">
          <legend>For items that differ from your library</legend>
          <label>
            <input
              type="radio"
              name="conflict-policy"
              value="keep-existing"
              checked={policy === 'keep-existing'}
              onChange={() => {
                setPolicy('keep-existing');
              }}
            />
            <span>Keep the version in my library (recommended)</span>
          </label>
          <label>
            <input
              type="radio"
              name="conflict-policy"
              value="replace"
              checked={policy === 'replace'}
              onChange={() => {
                setPolicy('replace');
              }}
            />
            <span>
              Replace it with the version from the file. Your notes and tags on{' '}
              {summary.conflicts === 1 ? 'that item' : 'those items'} will be overwritten.
            </span>
          </label>
        </fieldset>
      )}

      {error !== null && (
        <p className="message message--error" role="alert">
          {error}
        </p>
      )}
      <div className="import-panel__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={busy || toWrite === 0}
          onClick={() => void confirm()}
        >
          {summary === null
            ? 'Import'
            : toWrite === 0
              ? 'Nothing to import'
              : `Import ${plural(toWrite, 'item')}`}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => {
            onFinish(null);
          }}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

function describeImport(summary: ImportSummary): string {
  const kept = summary.conflicts - summary.replaced;
  return [
    summary.added > 0 || summary.replaced === 0
      ? `Imported ${plural(summary.added, 'new item')}.`
      : '',
    summary.replaced > 0 ? `Replaced ${plural(summary.replaced, 'item')}.` : '',
    kept > 0 ? `Kept your version of ${plural(kept, 'item')}.` : '',
    summary.unchanged > 0
      ? `${plural(summary.unchanged, 'item')} ${summary.unchanged === 1 ? 'was' : 'were'} already in your library.`
      : '',
    summary.invalid > 0
      ? `Skipped ${plural(summary.invalid, 'unreadable entry', 'unreadable entries')}.`
      : '',
  ]
    .filter((part) => part !== '')
    .join(' ');
}
