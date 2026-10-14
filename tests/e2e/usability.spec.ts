import {
  buttonSelector,
  clickButton,
  clickButtonThatCloses,
  focused,
  readLibrary,
  textOf,
} from './support/dom';
import { expect, test, type ExtensionPage } from './support/fixtures';
import { LIBRARY, seed, storedItem } from './support/library-data';

const valueOf = (page: ExtensionPage, selector: string) => () =>
  page.evaluate(
    (selector) => document.querySelector<HTMLInputElement>(selector)?.value ?? null,
    selector,
  );

// Real mouse and keyboard input throughout (see UserInput in support/types.ts).
test('the library works from the keyboard and keeps focus in place', async ({ extension }) => {
  const library = await extension.openPage('library.html');
  await seed(library, LIBRARY);
  await expect.poll(async () => (await readLibrary(library)).length).toBe(4);
  const click = async (label: string, within?: string) => {
    await library.user.click(await buttonSelector(library, label, within));
  };

  // "/" jumps to the search box, and Escape clears it.
  await library.user.press('/');
  expect(await focused(library)).toBe('input[name=search]');
  expect(await valueOf(library, 'input[name="search"]')()).toBe('');
  await library.user.type('soup');
  await expect.poll(async () => (await readLibrary(library)).length).toBe(1);
  await library.user.press('Escape');
  expect(await valueOf(library, 'input[name="search"]')()).toBe('');
  await expect.poll(async () => (await readLibrary(library)).length).toBe(4);
  // Inside a text field, "/" is just typed.
  await library.user.type('/');
  expect(await valueOf(library, 'input[name="search"]')()).toBe('/');
  await library.user.press('Backspace');
  expect(await valueOf(library, 'input[name="search"]')()).toBe('');

  // The editor suggests existing tags, most used first. "Morning news" has none yet.
  await click('Edit note and tags');
  expect(await focused(library)).toBe('textarea[name=note]');
  await expect
    .poll(() => textOf(library, '[aria-label="Add one of your tags"]'))
    .toBe('+ ml+ food+ papers');
  await click('+ ml');
  await click('+ papers');
  expect(await valueOf(library, '.item__editor input[name="tags"]')()).toBe('ml, papers');
  expect(await textOf(library, '[aria-label="Add one of your tags"]')).toBe('+ food');
  await click('Save changes');
  await expect
    .poll(async () => (await readLibrary(library))[0])
    .toMatchObject({ title: 'Morning news', tags: ['#ml', '#papers'] });
  // The card shows when it was changed, and focus returns to the button that opened the editor.
  expect(await textOf(library, '[data-testid="item-edited"]')).toMatch(/^Edited .+/);
  expect(await focused(library)).toBe('button in library-item: Edit note and tags');

  // Escape closes the editor without saving.
  await click('Edit note and tags');
  await library.user.type('Not saved');
  expect(await valueOf(library, '.item__editor textarea[name="note"]')()).toBe('Not saved');
  await library.user.press('Escape');
  await expect.poll(() => textOf(library, '.item__editor')).toBeNull();
  expect(await focused(library)).toBe('button in library-item: Edit note and tags');
  expect((await readLibrary(library))[0]?.note).toBeNull();

  // Cancelling a delete returns focus to Delete; deleting moves it to the message.
  await click('Delete');
  expect(await focused(library)).toBe('button in library-item: Cancel');
  await click('Cancel');
  expect(await focused(library)).toBe('button in library-item: Delete');
  await click('Delete');
  await click('Delete permanently');
  await expect
    .poll(() => textOf(library, '[data-testid="library-notice"] p'))
    .toBe('Deleted "Morning news". Dismiss');
  expect(await focused(library)).toMatch(/^div in library-notice: Deleted "Morning news"/);
  expect(await readLibrary(library)).toHaveLength(3);
  expect(library.errors()).toEqual([]);
});

test('the popup suggests tags and shows the saved page in the library', async ({
  extension,
  site,
}) => {
  const library = await extension.openPage('library.html');
  await seed(library, LIBRARY);
  await library.close();

  const article = await extension.openWebPage(site.url('/article.html'));
  const popup = await extension.openPopup(article);
  await expect
    .poll(() => textOf(popup, '[aria-label="Add one of your tags"]'))
    .toBe('+ ml+ food+ papers');
  await clickButton(popup, '+ food');
  expect(await valueOf(popup, 'input[name="tags"]')()).toBe('food');
  await clickButton(popup, 'Save page');
  await expect.poll(() => textOf(popup, '[data-testid="save-feedback"]')).toBe('Page saved.');

  // "Show in library" opens the library scrolled to the item, with focus on it.
  const opened = extension.nextPage('library.html');
  await clickButtonThatCloses(popup, 'Show in library');
  const shown = await opened;
  await expect
    .poll(() => textOf(shown, '[data-target="true"] [data-testid="item-title"]'))
    .toBe('Deep work notes');
  expect(
    await shown.evaluate(() => ({
      search: location.search.startsWith('?item='),
      focusedTitle:
        document.activeElement?.tagName === 'ARTICLE'
          ? document.activeElement.querySelector('[data-testid="item-title"]')?.textContent
          : null,
    })),
  ).toEqual({ search: true, focusedTitle: 'Deep work notes' });
  expect((await readLibrary(shown)).find((card) => card.title === 'Deep work notes')?.tags).toEqual(
    ['#food'],
  );

  // An already saved page offers the same link straight away.
  const again = await extension.openPopup(article);
  await expect.poll(() => textOf(again, '[data-testid="show-in-library"]')).toBe('Show in library');
  expect(shown.errors()).toEqual([]);
});

test('Show in library scrolls to an older item, outlines it, and focuses it', async ({
  extension,
  site,
}) => {
  // The article was saved long ago, below 30 newer items.
  const library = await extension.openPage('library.html');
  const newer = Array.from({ length: 30 }, (_, index) =>
    storedItem(`newer-${String(index)}`, {
      url: `https://news.example/story-${String(index)}`,
      pageTitle: `Story ${String(index)}`,
      createdAt: `2026-10-${String(10 + (index % 10)).padStart(2, '0')}T08:00:00.000Z`,
    }),
  );
  await seed(library, {
    ...storedItem('old', {
      url: site.url('/article.html'),
      pageTitle: 'Deep work notes',
      createdAt: '2026-01-15T08:00:00.000Z',
    }),
    ...Object.fromEntries(newer.flatMap((item) => Object.entries(item))),
  });
  await expect.poll(async () => (await readLibrary(library)).length).toBe(31);
  await library.close();

  const article = await extension.openWebPage(site.url('/article.html'));
  const popup = await extension.openPopup(article);
  await expect.poll(() => textOf(popup, '[data-testid="show-in-library"]')).toBe('Show in library');
  const opened = extension.nextPage('library.html');
  await clickButtonThatCloses(popup, 'Show in library');
  const shown = await opened;

  await expect
    .poll(() =>
      shown.evaluate(() => {
        const card = document.querySelector('[data-target="true"]');
        if (!card) return null;
        const box = card.getBoundingClientRect();
        // The theme's accent colour, as the browser computes it.
        const sample = document.createElement('span');
        sample.style.color = 'var(--color-accent)';
        document.body.append(sample);
        const accent = getComputedStyle(sample).color;
        sample.remove();
        return {
          title: card.querySelector('[data-testid="item-title"]')?.textContent,
          isLast: card === document.querySelector('[data-testid="library-item"]:last-child'),
          scrolled: window.scrollY > 0,
          inView: box.top >= 0 && box.bottom <= window.innerHeight,
          outlined: getComputedStyle(card).borderTopColor === accent,
          focused: document.activeElement === card.querySelector('article'),
        };
      }),
    )
    .toEqual({
      title: 'Deep work notes',
      isLast: true,
      scrolled: true,
      inView: true,
      outlined: true,
      focused: true,
    });
  expect(shown.errors()).toEqual([]);
});

test('a page in Firefox Reader View is saved under its real address', async ({
  extension,
  site,
}) => {
  const { firefox } = extension;
  test.skip(!firefox, 'Reader View is a Firefox feature');
  if (!firefox) return;
  const address = site.url('/reader.html');
  const popup = await firefox.openPopupOnBrowserPage(
    `about:reader?url=${encodeURIComponent(address)}`,
  );

  await expect.poll(() => textOf(popup, '[data-testid="page-status"]')).toBe('127.0.0.1');
  await clickButton(popup, 'Save page');
  await expect.poll(() => textOf(popup, '[data-testid="save-feedback"]')).toBe('Page saved.');

  const library = await extension.openPage('library.html');
  await expect
    .poll(() =>
      library.evaluate(
        () => document.querySelector<HTMLAnchorElement>('[data-testid="item-title"]')?.href,
      ),
    )
    .toBe(address);
  expect(library.errors()).toEqual([]);
});
