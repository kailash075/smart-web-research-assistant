import { err, ok, type Result } from '@/shared/result';
import { normalizeTags } from './tags';
import { parseSaveableUrl, siteOf } from './url';
import { checkMaxLength, issue, LIMITS, type ValidationIssue } from './validation';

export type ResearchItemId = string;

type ResearchItemBase = {
  id: ResearchItemId;
  /** Address of the page the item came from. Always http(s). */
  url: string;
  pageTitle: string;
  /** Free-form user note; empty string when there is none. */
  note: string;
  /** Normalised tags, see `normalizeTag`. */
  tags: readonly string[];
  /** ISO 8601 timestamps (UTC). */
  createdAt: string;
  updatedAt: string;
};

export type PageItem = ResearchItemBase & { kind: 'page' };
export type HighlightItem = ResearchItemBase & { kind: 'highlight'; text: string };
export type ResearchItem = PageItem | HighlightItem;

/** What the browser tells us about a page when the user saves it. */
export type PageCapture = {
  url: string;
  title: string;
  note?: string;
  tags?: readonly string[];
};

export type HighlightCapture = PageCapture & { text: string };

/** Values the caller supplies so these functions stay pure and testable. */
export type NewItemContext = { id: ResearchItemId; now: string };

export type ItemDetailsChanges = { note?: string; tags?: readonly string[] };

export function createPageItem(
  capture: PageCapture,
  context: NewItemContext,
): Result<PageItem, ValidationIssue[]> {
  const base = buildBase(capture, context);
  return base.ok ? ok({ ...base.value, kind: 'page' }) : base;
}

export function createHighlightItem(
  capture: HighlightCapture,
  context: NewItemContext,
): Result<HighlightItem, ValidationIssue[]> {
  const text = normalizeHighlightText(capture.text);
  const textIssues =
    text === ''
      ? [issue('text', 'required', 'Select some text on the page first.')]
      : checkMaxLength('text', text, LIMITS.highlightLength, 'The selected text');
  const base = buildBase(capture, context);
  const issues = [...(base.ok ? [] : base.error), ...textIssues];
  if (!base.ok || issues.length > 0) return err(issues);
  return ok({ ...base.value, kind: 'highlight', text });
}

/** Applies user edits to the note and tags. Returns the same item if nothing changed. */
export function updateItemDetails<T extends ResearchItem>(
  item: T,
  changes: ItemDetailsChanges,
  now: string,
): Result<T, ValidationIssue[]> {
  const note = changes.note === undefined ? item.note : normalizeNote(changes.note);
  const tags = changes.tags === undefined ? ok([...item.tags]) : normalizeTags(changes.tags);
  const issues = [
    ...checkMaxLength('note', note, LIMITS.noteLength, 'The note'),
    ...(tags.ok ? [] : [tags.error]),
  ];
  if (!tags.ok || issues.length > 0) return err(issues);

  const unchanged = note === item.note && sameTags(tags.value, item.tags);
  return ok(unchanged ? item : { ...item, note, tags: tags.value, updatedAt: now });
}

function buildBase(
  capture: PageCapture,
  context: NewItemContext,
): Result<ResearchItemBase, ValidationIssue[]> {
  const url = parseSaveableUrl(capture.url);
  const note = normalizeNote(capture.note ?? '');
  const tags = normalizeTags(capture.tags ?? []);
  const issues = [
    ...(url.ok ? [] : [url.error]),
    ...checkMaxLength('note', note, LIMITS.noteLength, 'The note'),
    ...(tags.ok ? [] : [tags.error]),
  ];
  if (!url.ok || !tags.ok || issues.length > 0) return err(issues);

  return ok({
    id: context.id,
    url: url.value.href,
    pageTitle: normalizeTitle(capture.title, url.value),
    note,
    tags: tags.value,
    createdAt: context.now,
    updatedAt: context.now,
  });
}

// Titles come from the page, not the user, so overlong ones are shortened instead of rejected.
function normalizeTitle(raw: string, url: URL): string {
  const title = raw.replace(/\s+/g, ' ').trim();
  if (title === '') return siteOf(url);
  return title.length > LIMITS.titleLength ? `${title.slice(0, LIMITS.titleLength - 1)}…` : title;
}

function normalizeNote(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
}

function normalizeHighlightText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}
