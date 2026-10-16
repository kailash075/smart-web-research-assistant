import { textOf } from './support/dom';
import { expect, test } from './support/fixtures';

// Where a person sees the name PageNest. Elsewhere: Firefox's right-click items in
// save.spec.ts, the export file's name in backup.spec.ts, and the shortcut names in
// lifecycle.spec.ts. Chrome draws its right-click menu outside any page, where a test
// cannot read the text; desktop.spec.ts saves screenshots of it instead.

test('the toolbar button and the library are named PageNest', async ({ extension, site }) => {
  await extension.openWebPage(site.url('/article.html'));
  expect(await extension.toolbarButton()).toEqual({ badge: '', title: 'PageNest' });

  const library = await extension.openPage('library.html');
  await expect.poll(() => textOf(library, 'h1')).toBe('PageNest library');
  // The browser shows the page title on the library's tab.
  expect(await library.evaluate(() => document.title)).toBe('PageNest library');
});

test('the popup is named PageNest', async ({ extension, site }) => {
  const popup = await extension.openPopup(await extension.openWebPage(site.url('/article.html')));

  await expect.poll(() => textOf(popup, 'h1')).toBe('PageNest');
});

test("Chrome's extensions page lists PageNest", async ({ extension }) => {
  test.skip(extension.firefox !== undefined, 'chrome://extensions is in Chrome');
  const page = await extension.openWebPage('chrome://extensions');

  await expect.poll(() => page.evaluate(readExtensionsPage)).toEqual(['PageNest']);
});

test("Firefox's Add-ons Manager lists PageNest", async ({ extension }) => {
  const { firefox } = extension;
  test.skip(!firefox, 'about:addons is in Firefox');
  if (!firefox) return;

  expect(await firefox.addonsManagerNames()).toEqual(['PageNest']);
});

// The names on the cards of chrome://extensions. Runs in the page, whose parts are
// inside shadow roots.
function readExtensionsPage(): string[] {
  const names: string[] = [];
  const walk = (root: Document | ShadowRoot) => {
    for (const element of Array.from(root.querySelectorAll('*'))) {
      if (element.tagName === 'EXTENSIONS-ITEM') {
        const name = element.shadowRoot?.querySelector('#name')?.textContent.trim();
        if (name) names.push(name);
      } else if (element.shadowRoot) {
        walk(element.shadowRoot);
      }
    }
  };
  walk(document);
  return names;
}
