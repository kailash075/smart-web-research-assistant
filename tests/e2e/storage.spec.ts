import { expect, test, type ExtensionPage } from './support/fixtures';

// The `chrome` namespace exists in both browsers' extension pages.
declare const chrome: {
  storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } };
};

const EMPTY = '0 items (0 pages, 0 highlights)';
const ONE_PAGE = '1 item (1 page, 0 highlights)';
const ONE_PAGE_ONE_DAMAGED = '1 item (1 page, 0 highlights), 1 unreadable item skipped';

const readSummary = (popup: ExtensionPage) => () =>
  popup.evaluate(
    () => document.querySelector('[data-testid="library-summary"]')?.textContent ?? '',
  );

test('a fresh install shows an empty library', async ({ extension }) => {
  const popup = await extension.openPage('popup.html');

  await expect.poll(readSummary(popup)).toBe(EMPTY);
  expect(popup.errors()).toEqual([]);
});

// Writes records in the stored format directly, so damaged records can be tested too.
// Saving through the popup is covered in save.spec.ts.
test('counts saved items, reports damaged ones, and keeps both after a restart', async ({
  launchExtension,
}) => {
  const first = await launchExtension();

  // Step 1: a fresh popup shows an empty library.
  const popup = await first.extension.openPage('popup.html');
  await expect.poll(readSummary(popup)).toBe(EMPTY);

  // Step 2: a valid page record is counted, both live and after reopening the popup.
  await popup.evaluate(() =>
    chrome.storage.local.set({
      'item:demo': {
        id: 'demo',
        kind: 'page',
        url: 'https://example.com/',
        pageTitle: 'Demo',
        note: '',
        tags: [],
        createdAt: '2026-10-13T09:00:00.000Z',
        updatedAt: '2026-10-13T09:00:00.000Z',
      },
    }),
  );
  await expect.poll(readSummary(popup)).toBe(ONE_PAGE);
  const reopened = await first.extension.openPage('popup.html');
  await expect.poll(readSummary(reopened)).toBe(ONE_PAGE);

  // Step 3: a damaged record is skipped and reported instead of breaking the library.
  await reopened.evaluate(() => chrome.storage.local.set({ 'item:bad': { nope: true } }));
  await expect.poll(readSummary(reopened)).toBe(ONE_PAGE_ONE_DAMAGED);
  const reopenedAgain = await first.extension.openPage('popup.html');
  await expect.poll(readSummary(reopenedAgain)).toBe(ONE_PAGE_ONE_DAMAGED);
  expect(reopenedAgain.errors()).toEqual([]);

  // Step 4: after a full browser restart on the same profile, both are still there.
  await first.close();
  const second = await launchExtension();
  const afterRestart = await second.extension.openPage('popup.html');

  await expect.poll(readSummary(afterRestart)).toBe(ONE_PAGE_ONE_DAMAGED);
  expect(afterRestart.errors()).toEqual([]);
});
