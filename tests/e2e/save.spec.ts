import {
  clearSelection,
  clickButton,
  fill,
  isDisabled,
  readLibrary,
  selectInField,
  selectText,
  textOf,
} from './support/dom';
import { expect, test, type ExtensionPage } from './support/fixtures';

const QUOTE = 'Focus is a skill that improves with deliberate practice.';

const feedbackOf = (popup: ExtensionPage) => () => textOf(popup, '[data-testid="save-feedback"]');
const summaryOf = (popup: ExtensionPage) => () => textOf(popup, '[data-testid="library-summary"]');

test.describe('saving from the popup', () => {
  test('saves the current page with a note and tags, and only once', async ({
    extension,
    site,
  }) => {
    const article = await extension.openWebPage(site.url('/article.html'));
    const popup = await extension.openPopup(article);

    await expect.poll(() => textOf(popup, '[data-testid="page-title"]')).toBe('Deep work notes');
    await fill(popup, 'textarea[name="note"]', 'Chapter 2 is the key part');
    await fill(popup, 'input[name="tags"]', 'Focus, #Books');
    await clickButton(popup, 'Save page');

    await expect.poll(feedbackOf(popup)).toBe('Page saved.');
    await expect.poll(summaryOf(popup)).toBe('1 item (1 page, 0 highlights)');
    await expect.poll(() => isDisabled(popup, '[data-testid="save-page"]')).toBe(true);
    expect(await textOf(popup, '[data-testid="save-page"]')).toBe('Page already saved');
    expect(await textOf(popup, 'textarea[name="note"]')).toBe('');
    await popup.close();

    // The same page with a tracking parameter and a #fragment counts as already saved.
    const again = await extension.openWebPage(
      site.url('/article.html?utm_source=newsletter#comments'),
    );
    const secondPopup = await extension.openPopup(again);
    await expect
      .poll(() => textOf(secondPopup, '[data-testid="page-status"]'))
      .toMatch(/^127\.0\.0\.1 · Saved .+/);
    expect(await isDisabled(secondPopup, '[data-testid="save-page"]')).toBe(true);

    const library = await extension.openPage('library.html');
    await expect
      .poll(() => readLibrary(library))
      .toEqual([
        {
          kind: 'page',
          title: 'Deep work notes',
          site: '127.0.0.1',
          text: null,
          note: 'Chapter 2 is the key part',
          tags: ['#focus', '#books'],
        },
      ]);
    expect(library.errors()).toEqual([]);
  });

  test('saves selected text as a highlight, and only once', async ({ extension, site }) => {
    const article = await extension.openWebPage(site.url('/article.html'));
    await selectText(article, '#quote');
    const popup = await extension.openPopup(article);

    await clickButton(popup, 'Save selection');
    await expect.poll(feedbackOf(popup)).toBe('Highlight saved.');
    await clickButton(popup, 'Save selection');
    await expect
      .poll(feedbackOf(popup))
      .toMatch(/^Highlight was already saved on .+\. Nothing was changed\.$/);
    await expect.poll(summaryOf(popup)).toBe('1 item (0 pages, 1 highlight)');

    const library = await extension.openPage('library.html');
    await expect
      .poll(() => readLibrary(library))
      .toEqual([
        {
          kind: 'highlight',
          title: 'Deep work notes',
          site: '127.0.0.1',
          text: QUOTE,
          note: null,
          tags: [],
        },
      ]);
    expect(library.errors()).toEqual([]);
  });

  test('saves text selected inside a text field', async ({ extension, site }) => {
    const article = await extension.openWebPage(site.url('/article.html'));
    await selectInField(article, '#draft', 0, 10);
    const popup = await extension.openPopup(article);

    await clickButton(popup, 'Save selection');

    await expect.poll(feedbackOf(popup)).toBe('Highlight saved.');
    const library = await extension.openPage('library.html');
    await expect.poll(async () => (await readLibrary(library))[0]?.text).toBe('Draft text');
  });

  test('asks for a selection when nothing is selected', async ({ extension, site }) => {
    const article = await extension.openWebPage(site.url('/article.html'));
    await clearSelection(article);
    const popup = await extension.openPopup(article);

    await clickButton(popup, 'Save selection');

    await expect
      .poll(() => textOf(popup, '[data-testid="save-feedback"] [role="alert"]'))
      .toBe('Select some text on the page first.');
    expect(await summaryOf(popup)()).toBe('0 items (0 pages, 0 highlights)');
  });

  test('never reads text selected in a password field', async ({ extension, site }) => {
    const article = await extension.openWebPage(site.url('/article.html'));
    await selectInField(article, '#secret', 0, 8);
    const popup = await extension.openPopup(article);

    await clickButton(popup, 'Save selection');

    await expect.poll(feedbackOf(popup)).toBe('PageNest never saves text from password fields.');
    expect(await summaryOf(popup)()).toBe('0 items (0 pages, 0 highlights)');
  });
});

// Chrome's DevTools protocol can click the toolbar button but cannot open native
// context menus or press extension shortcuts. desktop.spec.ts covers those paths in
// both browsers with real input on a virtual display.
test.describe('saving with the context menu and shortcuts', () => {
  test.skip(({ browserName }) => browserName !== 'firefox', 'Needs Firefox debugger controls');

  test('the context menu saves the page or the selection', async ({ extension, site }) => {
    const firefox = extension.firefox;
    if (!firefox) throw new Error('Firefox controls are missing');
    const article = await extension.openWebPage(site.url('/article.html'));

    await clearSelection(article);
    expect(await firefox.contextMenuItems(article, '#second')).toEqual(['Save page to PageNest']);
    await firefox.chooseContextMenuItem(article, '#second', 'Save page to PageNest');
    await expect
      .poll(() => extension.toolbarButton())
      .toEqual({ badge: '✓', title: 'PageNest: Page saved.' });

    await selectText(article, '#quote');
    expect(await firefox.contextMenuItems(article, '#quote')).toEqual([
      'Save selection to PageNest',
    ]);
    await firefox.chooseContextMenuItem(article, '#quote', 'Save selection to PageNest');
    await expect
      .poll(() => extension.toolbarButton())
      .toEqual({ badge: '✓', title: 'PageNest: Highlight saved.' });

    const library = await extension.openPage('library.html');
    await expect
      .poll(async () => (await readLibrary(library)).map((card) => card.kind).sort())
      .toEqual(['highlight', 'page']);
    expect(library.errors()).toEqual([]);
  });

  test('Alt+Shift+M opens the popup for the current page', async ({ extension, site }) => {
    const firefox = extension.firefox;
    if (!firefox) throw new Error('Firefox controls are missing');
    const article = await extension.openWebPage(site.url('/article.html'));

    const popupOpened = extension.nextPopup();
    await firefox.pressShortcut(article, 'Alt+Shift+M');
    const popup = await popupOpened;

    await expect.poll(() => textOf(popup, '[data-testid="page-title"]')).toBe('Deep work notes');
    expect(popup.errors()).toEqual([]);
  });

  test('keyboard shortcuts save the page and the selection', async ({ extension, site }) => {
    const firefox = extension.firefox;
    if (!firefox) throw new Error('Firefox controls are missing');
    const article = await extension.openWebPage(site.url('/article.html'));

    await firefox.pressShortcut(article, 'Alt+Shift+D');
    await expect
      .poll(() => extension.toolbarButton())
      .toEqual({ badge: '✓', title: 'PageNest: Page saved.' });

    await firefox.pressShortcut(article, 'Alt+Shift+D');
    await expect
      .poll(() => extension.toolbarButton())
      .toEqual({ badge: '✓', title: 'PageNest: Page was already saved.' });

    await selectText(article, '#quote');
    await firefox.pressShortcut(article, 'Alt+Shift+L');
    await expect
      .poll(() => extension.toolbarButton())
      .toEqual({ badge: '✓', title: 'PageNest: Highlight saved.' });

    await clearSelection(article);
    await firefox.pressShortcut(article, 'Alt+Shift+L');
    await expect
      .poll(() => extension.toolbarButton())
      .toEqual({ badge: '!', title: 'PageNest: Select some text on the page first.' });

    const library = await extension.openPage('library.html');
    await expect.poll(async () => (await readLibrary(library)).length).toBe(2);
  });
});
