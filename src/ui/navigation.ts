import { browser } from 'wxt/browser';

/** Opens the library page in a new tab. */
export async function openLibrary(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
}
