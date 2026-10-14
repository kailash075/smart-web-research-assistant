import { writeFileSync } from 'node:fs';
import type { TestInfo } from '@playwright/test';
import { readLibrary, textOf } from './support/dom';
import { expect, test, type ExtensionPage } from './support/fixtures';
import { LIBRARY, seed } from './support/library-data';

// Whether the page follows the colour scheme and fits its width. Screenshots are saved
// in test-results (for example test-results/appearance-…-firefox/popup-dark.png) for a
// person to look over.
const layout = (page: ExtensionPage) =>
  page.evaluate(() => {
    const [red = 0, green = 0, blue = 0] = (
      getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? []
    ).map(Number);
    const root = document.documentElement;
    return {
      background: (red + green + blue) / 3 < 128 ? 'dark' : 'light',
      sideScroll: root.scrollWidth > root.clientWidth,
    };
  });

async function saveScreenshot(page: ExtensionPage, name: string, testInfo: TestInfo) {
  writeFileSync(testInfo.outputPath(`${name}.png`), await page.screenshot());
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the library in the ${colorScheme} colour scheme`, async ({ launchExtension }, testInfo) => {
    const { extension } = await launchExtension({ colorScheme });
    const library = await extension.openPage('library.html');
    await seed(library, LIBRARY);
    await expect.poll(async () => (await readLibrary(library)).length).toBe(4);

    expect(await layout(library)).toEqual({ background: colorScheme, sideScroll: false });
    await saveScreenshot(library, `library-${colorScheme}`, testInfo);
    expect(library.errors()).toEqual([]);
  });

  test(`the popup in the ${colorScheme} colour scheme`, async ({
    launchExtension,
    site,
  }, testInfo) => {
    const { extension } = await launchExtension({ colorScheme });
    const library = await extension.openPage('library.html');
    await seed(library, LIBRARY);
    await library.close();
    const popup = await extension.openPopup(await extension.openWebPage(site.url('/article.html')));
    await expect.poll(() => textOf(popup, '[data-testid="page-title"]')).toBe('Deep work notes');
    await expect
      .poll(() => textOf(popup, '[aria-label="Add one of your tags"]'))
      .toBe('+ ml+ food+ papers');

    expect(await layout(popup)).toEqual({ background: colorScheme, sideScroll: false });
    await saveScreenshot(popup, `popup-${colorScheme}`, testInfo);
    expect(popup.errors()).toEqual([]);
  });
}
