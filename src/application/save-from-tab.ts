import { originalPageUrl, parseSaveableUrl } from '@/domain/url';
import { err, ok, type Result } from '@/shared/result';
import type { AppError } from './errors';
import type { BrowserTab, TabsPort } from './ports';
import { saveHighlight, savePage, type SaveDeps, type SaveOutcome } from './save-item';

export type TabSaveDeps = SaveDeps & { tabs: TabsPort };

/** What the user adds while saving. */
export type SaveExtras = { note?: string; tags?: readonly string[] };

/** Where the selected text comes from when saving a selection. */
export type SelectionSource = {
  /** The frame that holds the selection; the top frame when omitted. */
  frameId?: number;
  /**
   * Text the browser already reported (the context menu provides it). Used when the
   * page cannot be read, for example in a PDF viewer.
   */
  fallbackText?: string;
};

export type SaveablePage = { url: string; title: string };

/** The page a tab shows, or why it cannot be saved. */
export function pageFromTab(tab: BrowserTab): Result<SaveablePage, AppError> {
  if (tab.url === undefined) return err(NO_ACCESS);
  const address = originalPageUrl(tab.url);
  const url = parseSaveableUrl(address);
  if (!url.ok) return err({ kind: 'unsupported_page', message: url.error.message });
  return ok({ url: address, title: tab.title ?? '' });
}

export async function savePageFromTab(
  deps: TabSaveDeps,
  tab: BrowserTab,
  extras: SaveExtras = {},
): Promise<Result<SaveOutcome, AppError>> {
  const page = pageFromTab(tab);
  if (!page.ok) return page;
  return savePage(deps, { ...page.value, ...extras });
}

export async function saveSelectionFromTab(
  deps: TabSaveDeps,
  tab: BrowserTab,
  extras: SaveExtras = {},
  source: SelectionSource = {},
): Promise<Result<SaveOutcome, AppError>> {
  const page = pageFromTab(tab);
  if (!page.ok) return page;

  // Prefer reading the page: it keeps line breaks and works for text fields.
  const selection = await deps.tabs.readSelection(tab.id, source.frameId);
  // The browser's own copy of the text must not be used either.
  if (!selection.ok && selection.error.kind === 'sensitive') {
    return err({ kind: 'page_access', message: selection.error.message });
  }
  const readText = selection.ok ? selection.value : '';
  const text = hasText(readText) ? readText : (source.fallbackText ?? '');
  if (!selection.ok && !hasText(text)) {
    return err({ kind: 'page_access', message: selection.error.message });
  }
  // Empty text is reported by the domain as "Select some text on the page first."
  return saveHighlight(deps, { ...page.value, ...extras, text });
}

function hasText(text: string): boolean {
  return text.trim() !== '';
}

const NO_ACCESS: AppError = {
  kind: 'unsupported_page',
  message:
    "Clipwise can't save this page. Browser pages such as settings, new tabs, and add-on stores are off limits to extensions.",
};
