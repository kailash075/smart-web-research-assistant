import { writeFileSync } from 'node:fs';
import { clickButton, readLibrary, selectText, textOf } from './support/dom';
import { expect, test, type ExtensionPage } from './support/fixtures';
import { PDF_TEXT } from './support/test-site';

// Pages PageNest cannot save, or can only partly read.

const ONLY_WEB_PAGES = 'Only web pages (http or https) can be saved.';
const CANNOT_READ_SELECTION =
  'PageNest cannot read the selected text on this page (PDF viewers and add-on stores, for example). Try right-clicking the selection and choosing "Save selection to PageNest".';

const statusOf = (popup: ExtensionPage) => () => textOf(popup, '[data-testid="page-status"]');
const feedbackOf = (popup: ExtensionPage) => () => textOf(popup, '[data-testid="save-feedback"]');

test('the popup explains that browser pages cannot be saved', async ({
  extension,
  browserName,
}) => {
  // WebDriver cannot open Firefox's own pages, so Firefox opens about:addons itself.
  const popup = extension.firefox
    ? await extension.firefox.openPopupOnBrowserPage('about:addons')
    : await extension.openPopup(await extension.openWebPage('chrome://extensions/'));

  // Chrome hides the address of its own pages; Firefox shows about:addons.
  await expect
    .poll(statusOf(popup))
    .toBe(
      browserName === 'firefox'
        ? ONLY_WEB_PAGES
        : "PageNest can't save this page. Browser pages such as settings, new tabs, and add-on stores are off limits to extensions.",
    );
  expect(await textOf(popup, '[data-testid="save-page"]')).toBeNull();
  expect(popup.errors()).toEqual([]);
});

test('local files cannot be saved, and the right-click items are hidden there', async ({
  extension,
}) => {
  const file = test.info().outputPath('local-note.html');
  writeFileSync(file, '<!doctype html><title>Local note</title><p id="note">Local text</p>');
  const page = await extension.openWebPage(`file://${file}`);

  const popup = await extension.openPopup(page);
  await expect.poll(statusOf(popup)).toBe(ONLY_WEB_PAGES);
  await popup.close();

  if (extension.firefox) {
    expect(await extension.firefox.contextMenuItems(page, '#note')).toEqual([]);
  }
});

test('in a PDF, the page can be saved and the popup explains how to save a selection', async ({
  extension,
  site,
}) => {
  const pdf = await extension.openWebPage(site.url('/paper.pdf'));
  const popup = await extension.openPopup(pdf);

  // The browser's PDF viewer hides the selection from extensions.
  await clickButton(popup, 'Save selection');
  await expect.poll(feedbackOf(popup)).toBe(CANNOT_READ_SELECTION);

  await clickButton(popup, 'Save page');
  await expect.poll(feedbackOf(popup)).toBe('Page saved.');
  const library = await extension.openPage('library.html');
  await expect
    .poll(async () => (await readLibrary(library)).map(({ kind, site: from }) => ({ kind, from })))
    .toEqual([{ kind: 'page', from: '127.0.0.1' }]);
  expect(library.errors()).toEqual([]);
});

test('in a PDF, right-clicking a selection saves it', async ({ extension, site }) => {
  test.skip(!extension.firefox, "Chrome's PDF viewer: see desktop.spec.ts");
  const firefox = extension.firefox;
  if (!firefox) return;
  const pdf = await extension.openWebPage(site.url('/paper.pdf'));
  // Firefox's PDF viewer (pdf.js) renders the text as spans that can be selected.
  await expect
    .poll(() => pdf.evaluate(() => document.querySelector('.textLayer span')?.textContent ?? null))
    .toBe(PDF_TEXT);
  await selectText(pdf, '.textLayer span');

  expect(await firefox.contextMenuItems(pdf, '.textLayer span')).toEqual([
    'Save selection to PageNest',
  ]);
  await firefox.chooseContextMenuItem(pdf, '.textLayer span', 'Save selection to PageNest');

  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'PageNest: Highlight saved.' });
  const library = await extension.openPage('library.html');
  await expect
    .poll(async () => (await readLibrary(library)).map(({ kind, text }) => ({ kind, text })))
    .toEqual([{ kind: 'highlight', text: PDF_TEXT }]);
});
