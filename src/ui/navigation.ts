import { browser } from 'wxt/browser';
import type { ResearchItemId } from '@/domain/research-item';

/** URL parameter that makes the library page scroll to one item. */
export const LIBRARY_ITEM_PARAM = 'item';

/** Opens the library page in a new tab, optionally scrolled to one item. */
export async function openLibrary(itemId?: ResearchItemId): Promise<void> {
  const query =
    itemId === undefined
      ? ''
      : `?${new URLSearchParams({ [LIBRARY_ITEM_PARAM]: itemId }).toString()}`;
  await browser.tabs.create({ url: browser.runtime.getURL(`/library.html${query}`) });
}
