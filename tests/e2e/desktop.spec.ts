import { writeFileSync } from 'node:fs';
import type { TestInfo } from '@playwright/test';
import { clearSelection, readLibrary, selectText, textOf } from './support/dom';
import { expect, test, type InstalledExtension } from './support/fixtures';
import { PDF_TEXT, PDF_TITLE } from './support/test-site';
import type { DesktopControls, WebPage } from './support/types';
import { hasVirtualDisplay } from './support/virtual-display';

// What a person does: real key presses and clicks on native menus, sent through the
// operating system to a browser window on a virtual display. Browsers ignore extension
// shortcuts and cannot open native menus when the input comes from their automation
// protocols, so these are the only tests of those paths in Chrome. Screenshots of each
// menu are saved in test-results (for example test-results/desktop-…-chrome/).

test.skip(!hasVirtualDisplay(), 'Needs Xvfb: run `pnpm test:tools` (Debian or Ubuntu)');

async function onDesktop(
  launchExtension: (options: { desktop: true }) => Promise<{ extension: InstalledExtension }>,
): Promise<{ extension: InstalledExtension; desktop: DesktopControls }> {
  const { extension } = await launchExtension({ desktop: true });
  if (!extension.desktop) throw new Error('The browser is not on a virtual display');
  return { extension, desktop: extension.desktop };
}

/** Right-clicks `selector`, saves a screenshot of the menu, and returns Clipwise's items. */
async function rightClick(
  desktop: DesktopControls,
  page: WebPage,
  selector: string,
  screenshot: string,
  testInfo: TestInfo,
) {
  const menu = await desktop.openContextMenu(() => desktop.click(page, selector, 'right'));
  await desktop.screenshot(testInfo.outputPath(`${screenshot}.png`));
  return menu.clipwiseItems;
}

test('real key presses open the popup and save the page and the selection', async ({
  launchExtension,
  site,
}) => {
  const { extension, desktop } = await onDesktop(launchExtension);
  const article = await extension.openWebPage(site.url('/article.html'));
  await desktop.click(article, '#second');

  const popupOpened = extension.nextPopup();
  await desktop.pressKeys('Alt+Shift+M');
  const popup = await popupOpened;
  await expect.poll(() => textOf(popup, '[data-testid="page-title"]')).toBe('Deep work notes');
  expect(popup.errors()).toEqual([]);
  await popup.close();

  // Back to the page, as a person would after closing the popup.
  await desktop.click(article, '#second');
  await desktop.pressKeys('Alt+Shift+D');
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Page saved.' });
  await desktop.pressKeys('Alt+Shift+D');
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Page was already saved.' });

  await selectText(article, '#quote');
  await desktop.pressKeys('Alt+Shift+L');
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Highlight saved.' });

  await clearSelection(article);
  await desktop.pressKeys('Alt+Shift+L');
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '!', title: 'Clipwise: Select some text on the page first.' });

  const library = await extension.openPage('library.html');
  await expect
    .poll(async () => (await readLibrary(library)).map(({ kind, text }) => ({ kind, text })))
    .toEqual([
      { kind: 'highlight', text: 'Focus is a skill that improves with deliberate practice.' },
      { kind: 'page', text: null },
    ]);
});

test('the right-click menu saves the page, or only the selection when text is selected', async ({
  launchExtension,
  site,
}, testInfo) => {
  const { extension, desktop } = await onDesktop(launchExtension);
  const article = await extension.openWebPage(site.url('/article.html'));
  await desktop.click(article, '#second');
  await clearSelection(article);

  // One Clipwise item, "Save page to Clipwise"; what it saves shows which item it was.
  const pageItems = await rightClick(desktop, article, '#second', 'page-menu', testInfo);
  expect(pageItems).toHaveLength(1);
  await desktop.clickAt(pageItems[0] ?? { x: 0, y: 0 });
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Page saved.' });

  const again = await rightClick(desktop, article, '#second', 'page-menu-again', testInfo);
  await desktop.clickAt(again[0] ?? { x: 0, y: 0 });
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Page was already saved.' });

  // With text selected, Clipwise offers "Save selection to Clipwise" and not the page.
  await selectText(article, '#quote');
  const selectionItems = await rightClick(desktop, article, '#quote', 'selection-menu', testInfo);
  expect(selectionItems).toHaveLength(1);
  await desktop.clickAt(selectionItems[0] ?? { x: 0, y: 0 });
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Highlight saved.' });

  const library = await extension.openPage('library.html');
  await expect
    .poll(async () => (await readLibrary(library)).map(({ kind, text }) => ({ kind, text })))
    .toEqual([
      { kind: 'highlight', text: 'Focus is a skill that improves with deliberate practice.' },
      { kind: 'page', text: null },
    ]);
  expect(library.errors()).toEqual([]);
});

test('the right-click menu has no Clipwise items on local files and browser pages', async ({
  launchExtension,
  browserName,
}, testInfo) => {
  const { extension, desktop } = await onDesktop(launchExtension);
  const file = testInfo.outputPath('local.html');
  writeFileSync(file, '<!doctype html><title>Local note</title><p id="note">Local text</p>');
  const local = await extension.openWebPage(`file://${file}`);
  expect(await rightClick(desktop, local, '#note', 'file-menu', testInfo)).toEqual([]);
  await desktop.pressKeys('Escape');

  // Firefox's own pages cannot be opened from these tests (see special-pages.spec.ts).
  if (browserName === 'chromium') {
    const extensions = await extension.openWebPage('chrome://extensions/');
    expect(await rightClick(desktop, extensions, 'body', 'extensions-menu', testInfo)).toEqual([]);
    await desktop.pressKeys('Escape');
  }
});

test("in Chrome's PDF viewer, the menu key's menu saves the selection", async ({
  launchExtension,
  browserName,
  site,
}, testInfo) => {
  // Firefox's PDF viewer is a web page; special-pages.spec.ts covers it.
  test.skip(browserName !== 'chromium', "Chrome's PDF viewer only");
  const { extension, desktop } = await onDesktop(launchExtension);
  const pdf = await extension.openWebPage(site.url('/paper.pdf'));
  await expect.poll(() => extension.tabTitle(pdf)).toBe(PDF_TITLE);

  // Pages cannot see into the viewer, so select everything and use the menu key, which
  // opens the menu for the selection wherever the viewer drew it. The viewer fills the
  // window but is not part of the page, so a box over the window marks where to click.
  await pdf.evaluate(() => {
    const box = document.createElement('div');
    box.id = 'window-area';
    box.style.cssText = 'position: fixed; inset: 0; pointer-events: none';
    document.body.append(box);
  });
  await desktop.click(pdf, '#window-area');
  await desktop.pressKeys('Ctrl+A');
  const menu = await desktop.openContextMenu(() => desktop.pressKeys('Shift+F10'));
  await desktop.screenshot(testInfo.outputPath('pdf-menu.png'));
  expect(menu.clipwiseItems).toHaveLength(1);
  await desktop.clickAt(menu.clipwiseItems[0] ?? { x: 0, y: 0 });

  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Highlight saved.' });
  const library = await extension.openPage('library.html');
  await expect
    .poll(async () =>
      (await readLibrary(library)).map(({ kind, title, site: from, text }) => ({
        kind,
        title,
        from,
        text,
      })),
    )
    .toEqual([{ kind: 'highlight', title: PDF_TITLE, from: '127.0.0.1', text: PDF_TEXT }]);
});

// Pages can give links access keys. Firefox triggers them with Alt+Shift and the
// letter, like Clipwise's shortcuts, and gives the keys to the page; Chrome (on Windows
// and Linux) uses Alt and the letter. Clipwise's letters are ones Wikipedia leaves free.
test("Clipwise's shortcuts work on a page with Wikipedia's access keys", async ({
  launchExtension,
  site,
}) => {
  const { extension, desktop } = await onDesktop(launchExtension);
  const page = await extension.openWebPage(site.url('/wikipedia-keys.html'));
  await desktop.click(page, '#quote');

  await desktop.pressKeys('Alt+Shift+D');
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Page saved.' });
  await selectText(page, '#quote');
  await desktop.pressKeys('Alt+Shift+L');
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Highlight saved.' });
  const popupOpened = extension.nextPopup();
  await desktop.pressKeys('Alt+Shift+M');
  await popupOpened;
  expect(await page.evaluate(() => document.body.dataset['used'] ?? '')).toBe('');
});

test("in Firefox, a page's access keys with Clipwise's letters win over Clipwise", async ({
  launchExtension,
  browserName,
  site,
}) => {
  const { extension, desktop } = await onDesktop(launchExtension);
  const page = await extension.openWebPage(site.url('/clipwise-keys.html'));
  const usedKeys = () => page.evaluate(() => document.body.dataset['used'] ?? '');
  await desktop.click(page, '#quote');
  await selectText(page, '#quote');

  await desktop.pressKeys('Alt+Shift+L');
  if (browserName === 'firefox') {
    await expect.poll(usedKeys).toBe('l');
    await desktop.pressKeys('Alt+Shift+D', 'Alt+Shift+M');
    await expect.poll(usedKeys).toBe('ldm');
    expect(await extension.toolbarButton()).toEqual({ badge: '', title: 'Clipwise' });
    const library = await extension.openPage('library.html');
    expect(await readLibrary(library)).toEqual([]);
  } else {
    await expect
      .poll(() => extension.toolbarButton())
      .toEqual({ badge: '✓', title: 'Clipwise: Highlight saved.' });
    await desktop.pressKeys('Alt+Shift+D');
    await expect
      .poll(() => extension.toolbarButton())
      .toEqual({ badge: '✓', title: 'Clipwise: Page saved.' });
    const popupOpened = extension.nextPopup();
    await desktop.pressKeys('Alt+Shift+M');
    await popupOpened;
    expect(await usedKeys()).toBe('');
  }
});
